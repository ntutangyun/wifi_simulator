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
import { J, N, firstRetry, hallwayHouse, node, sc, txOf, type Lesson } from '../lessonKit'

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
  module: 1,
  title: { en: 'Retries, drops and queues', zh: '重传、丢帧与队列' },
  why: {
    en: 'A frame nobody answered is not lost yet: the sender simply sends it again. But sending it again is never free, and it cannot go on for ever. While one stubborn frame is being tried and tried, everything behind it waits. This lesson watches a link that keeps failing and a line that keeps growing, and asks when the kindest thing a device can do is throw a frame away.',
    zh: '一帧没人回答，并不等于它已经丢了：发送方再发一次就是了。但“再发一次”从来不是免费的，也不可能一直发下去。当一帧死活发不出去、被一次次重来时，排在它后面的一切都在等。这一课我们看着一条老是失败的链路，和一条越排越长的队，然后问一个问题：什么时候，把一帧扔掉才是这台设备能做的最厚道的事。',
  },
  outcomes: [
    { en: 'name the three reasons a frame is given up, and what each one tells you', zh: '说出一帧被放弃的三种原因，以及每一种告诉了你什么' },
    { en: 'explain why the real cost of a retry falls on the frames behind it', zh: '解释为什么一次重传真正的代价，落在它后面那些帧身上' },
    { en: 'say why a bigger buffer does not deliver one more frame', zh: '说清为什么把缓冲区改大，一帧也不会多送到' },
  ],
  needs: ['airtime', 'backoff'],
  terms: [
    { term: 'retry', plain: {
      en: 'the same frame sent again after no answer came, marked so a receiver can spot the repeat',
      zh: '没等到回答之后，把同一帧再发一次；帧上带着标记，好让接收端认出这是重复的',
    } },
    { term: 'retry limit', plain: {
      en: 'how many times one frame may be sent before the sender gives up on it',
      zh: '同一帧最多能发几次；发满了，发送方就放弃它',
    } },
    { term: 'queue', plain: {
      en: 'the line of frames waiting their turn to be sent, oldest at the front',
      zh: '等着轮到自己被发出去的那一列帧，最老的排在最前面',
    } },
    { term: 'lifetime', plain: {
      en: 'how long a frame may wait in the line before it is thrown away unsent',
      zh: '一帧在队列里最多能等多久；超过了，就不发了，直接扔掉',
    } },
  ],
  picture: [
    { heading: { en: 'Nobody answered', zh: '没人回答' }, text: {
      en: 'A sender cannot hear whether its own frame arrived. All it knows is that the ACK it was waiting for never came. So it sends the very same frame again — a retry — still from the front of the line, with one bit set so the receiver can tell a repeat from something new.',
      zh: '发送方听不见自己那一帧有没有到。它只知道，自己等的那个 ACK 一直没来。于是它把同一帧原样再发一次——这就是重传——位置仍在队列最前面，只是置上一个比特，好让接收端分得清这是重复的还是新的。',
    } },
    { heading: { en: 'Each attempt costs more than the last', zh: '每一次尝试都比上一次贵' }, text: {
      en: 'A retry is not simply the frame over again. The sender reads the silence as a sign of a crowd, doubles its CW and draws a longer backoff, so each further attempt starts later than the one before. The frame also tends to go out slower: after repeated failures the radio steps down to a sturdier, slower way of sending, so it lies on the air longer — a bigger target for the next collision.',
      zh: '重传不只是“把那一帧再来一遍”。发送方把这份沉默当成人多的信号，于是把 CW 翻倍、抽一个更长的退避值，结果每一次新的尝试都比上一次开始得更晚。帧本身往往也发得更慢：连着失败几次之后，无线电会降到一种更结实、也更慢的发法上，帧在空中拉得更长，也就成了下一次碰撞更大的靶子。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Follow one frame', zh: '盯住一帧' }, text: {
      en: 'Load the simulation and jump to the first retry. Follow one frame from the uploader on the left: the same frame going out again, and again, each attempt further from the last — until it stops.',
      zh: '载入仿真，跳到第一次重传。盯住左边那台上传终端的某一帧：同一帧一次、又一次地发出去，每次尝试都比上次隔得更远——直到它不再出现。',
    } },
    { heading: { en: 'Seven tries, then let it go', zh: '七次之后，放手' }, text: {
      en: 'No frame is tried for ever. Each one carries a count of how often it has been sent, and when that count reaches the retry limit — seven here — the frame is given up and the next one moves to the front. That is the rule working, not failing: a link that cannot push a frame through in seven tries will not push it through in seventy.',
      zh: '没有哪一帧可以永远重来。每一帧都记着自己已经被发过多少次，一旦这个数达到重传上限——这里是七——这一帧就被放弃，后面那一帧挪到队首。这不是规则出了问题，正是规则在起作用：一条七次都推不过去的链路，七十次也推不过去。',
    } },
    { heading: { en: 'The line behind it', zh: '它身后的队伍' }, text: {
      en: 'Frames keep arriving from the application above, and they wait their turn in a queue. They wait for the channel — and they wait for every attempt the frame in front of them makes. One stubborn frame at the head holds up a hundred healthy ones behind it. The real cost of a retry is never the airtime it burns; it is the delay it hands to everything else.',
      zh: '上面的应用还在不停地交下新的帧，它们在队列里等着轮到自己。它们要等信道——也要等排在前面那一帧的每一次尝试。队首一帧发不动，后面一百帧都跟着卡住。一次重传真正的代价，从来不是它烧掉的那点空口时间，而是它塞给其余所有帧的那段等待。',
    } },
    { heading: { en: 'Stale data is worse than none', zh: '过时的数据不如没有' }, text: {
      en: 'So a frame carries a clock as well as a count. Once it has waited in the queue past its lifetime — half a second here — the MAC throws it away without ever sending it. For a video frame or a voice sample that is exactly right: the moment it belonged to has gone, and delivering it late costs airtime and helps nobody.',
      zh: '所以一帧身上除了计数，还有一只钟。一旦它在队列里等过了自己的生存期——这里是半秒——MAC 就把它扔掉，连发都不发。对一个视频帧或一段语音采样来说，这么做完全正确：它本该属于的那一刻已经过去了，迟到地送达只会花掉空口时间，对谁都没有好处。',
    } },
    { heading: { en: 'And when the line is full', zh: '当队伍满了' }, text: {
      en: 'The queue also has a ceiling. When it is full, an arriving frame is turned away at the door and never joins the line at all. This is the one loss that says nothing about the link and everything about the load: more traffic is being offered than the channel can carry, and only less traffic or more airtime cures it.',
      zh: '队列还有一个上限。队列一满，新到的帧就在门口被挡回去，根本进不了队。这是唯一一种与链路无关、只与负载有关的损失：交下来的流量超过了信道能搬走的量，只有减少流量或腾出更多空口时间才治得了。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'One frame, seven attempts', zh: '一帧，七次尝试' }, head: [
      { en: 'Attempt', zh: '第几次' }, { en: 'Sent at', zh: '发送于' }, { en: 'Rate', zh: '速率' },
      { en: 'Repeat bit', zh: '重复标志' }, { en: 'Failure recorded', zh: '记录失败' }, { en: 'CW after', zh: '之后的 CW' },
    ], rows: [
      [N('1'), N('0 µs'), N('48 Mb/s'), N('0'), N('321 µs'), N('31')],
      [N('2'), N('526 µs'), N('48 Mb/s'), N('1'), N('847 µs'), N('63')],
      [N('3'), N('1683 µs'), N('36 Mb/s'), N('1'), N('2092 µs'), N('127')],
      [N('4'), N('4544 µs'), N('36 Mb/s'), N('1'), N('4953 µs'), N('255')],
      [N('5'), N('6999 µs'), N('24 Mb/s'), N('1'), N('7576 µs'), N('511')],
      [N('6'), N('13 632 µs'), N('24 Mb/s'), N('1'), N('14 209 µs'), N('1023')],
      [N('7'), N('26 940 µs'), N('18 Mb/s'), N('1'), { en: '27 689 µs — given up', zh: '27 689 µs——放弃' }, N('15')],
    ] },
    { heading: { en: 'Reading that table', zh: '这张表怎么读' }, text: {
      en: 'All seven attempts carry the same sequence number. The rate steps down after every second failure, so the first attempt is 276 µs of air and the seventh 704 µs. The frame behind it leaves at 27 741 µs, with a fresh number and the repeat bit clear.',
      zh: '七次尝试的序列号都是同一个。速率每失败两次降一档，于是第一次尝试占 276 µs 空口时间，第七次要 704 µs。排在它后面那一帧直到 27 741 µs 才发出去，序列号是新的，重复标志清零。',
    } },
    { kind: 'table', heading: { en: 'Three reasons a frame is given up', zh: '一帧被放弃的三种原因' }, head: [
      { en: 'What the log says', zh: '日志里写的' }, { en: 'It fires when', zh: '什么时候触发' }, { en: 'It means', zh: '它的含义' },
    ], rows: [
      [N('retryLimit'), { en: 'the seventh attempt at one frame fails', zh: '同一帧的第七次尝试失败了' }, { en: 'the link is failing — fix the link', zh: '链路在失败——要修的是链路' }],
      [N('lifetime'), { en: 'it has waited over 500 ms in the line', zh: '它在队列里等了超过 500 ms' }, { en: 'the data is stale, and dropping it is right', zh: '数据已经过时，丢掉它是对的' }],
      [N('queueFull'), { en: 'a new frame finds 500 already waiting', zh: '新帧到达时已有 500 帧在等' }, { en: 'overload — less load, or more capacity', zh: '过载——要么减负，要么扩容' }],
    ] },
    { kind: 'table', heading: { en: 'The same three seconds, three settings', zh: '同样的三秒，三种设置' }, head: [
      { en: 'Run', zh: '运行' }, { en: 'Turned away', zh: '门口挡回' }, { en: 'Stale at the AP', zh: 'AP 处过时' },
      { en: 'Uploads given up', zh: '上传被放弃' }, { en: 'Delivered by the AP', zh: 'AP 送达' },
    ], rows: [
      [{ en: 'Defaults: 500 frames, 500 ms', zh: '默认：500 帧、500 ms' }, N('213'), N('194'), N('123'), N('2644')],
      [{ en: 'Short queue: 100 frames', zh: '短队列：100 帧' }, N('797'), N('0'), N('123'), N('2644')],
      [{ en: 'Short lifetime: 100 ms', zh: '短生存期：100 ms' }, N('0'), N('770'), N('40'), N('2644')],
    ] },
    { heading: { en: 'What the knobs cannot do', zh: '旋钮做不到的事' }, text: {
      en: 'All three runs deliver the AP’s same 2644 video frames: a buffer cannot make airtime. A short queue moves the loss to the door; a short lifetime moves it to the clock, and the uploaders then lose 987 frames of their own to age.',
      zh: '三次运行里 AP 送达的都是同样的 2644 个视频帧：缓冲区变不出空口时间。短队列把损失挪到门口；短生存期把它挪到钟上，两台上传终端因此有 987 帧老死在队列里。',
    } },
    { kind: 'table', heading: { en: 'How long a delivered frame had waited', zh: '送达的帧等了多久' }, head: [
      { en: 'Delivered during', zh: '送达时段' }, { en: 'Mean wait, defaults', zh: '平均等待，默认' },
    ], rows: [
      [N('0–0.5 s'), N('19 ms')],
      [N('0.5–1 s'), N('149 ms')],
      [N('1–1.5 s'), N('228 ms')],
      [N('1.5–2 s'), N('324 ms')],
      [N('2–2.5 s'), N('472 ms')],
      [N('2.5–3 s'), N('472 ms')],
    ] },
  ],
  deeper: [
    { heading: { en: 'Two counters, not one', zh: '两个计数器，不是一个' }, text: {
      en: 'The decision to give a frame up uses that frame’s own count of attempts. The decision to widen the window uses a second counter, one per queue rather than per frame, which any success resets. They move in step while one frame is being hammered, and come apart the moment frames are dropped for age: at 504 465 µs Hidden B loses three aged frames at once, and the next frame’s first failure reads retries = 1 against a queue counter of 6, then 2 against 7 — at which point the window snaps back to 15 although the frame has spent only two of its seven attempts.',
      zh: '“是否放弃这一帧”看的是这一帧自己的尝试计数。“是否把窗口加宽”看的是另一个计数器：它属于队列而不是某一帧，任何一次成功都会让它复位。当同一帧被反复捶打时，两者步调一致；而一旦有帧因为年龄被丢掉，它们就分道扬镳：504 465 µs 处 Hidden B 一次丢掉三个老帧，紧接着那一帧第一次失败时读数是 retries = 1，而队列计数器已经是 6；第二次是 2 对 7——到这里窗口弹回 15，尽管这一帧七次机会才用掉两次。',
    } },
    { heading: { en: 'Head-of-line delay', zh: '队头阻塞' }, text: {
      en: 'Those three aged frames had been queued since the very first instant of the run. Nothing was wrong with them. They waited behind predecessors that each burned several attempts, and the age limit found them before the channel did — the cleanest picture of head-of-line delay this scene offers.',
      zh: '那三个老帧从仿真的第一个瞬间起就在队列里了。它们本身没有任何问题。它们排在一群各自烧掉好几次尝试的前辈后面，结果是年龄上限先找到了它们，而不是信道。这就是本场景里最干净的一幅队头阻塞图景。',
    } },
    { heading: { en: 'Under a Block Ack agreement', zh: '在块确认协议下' }, text: {
      en: 'When many frames are sent as one burst and acknowledged together, the sender repeats only the pieces the bitmap reports missing, each still bound by its own attempt count and age limit. This simulator does not model that yet: an aggregate succeeds or fails whole. The Tier 2 aggregation lesson adds it.',
      zh: '当许多帧作为一次突发发出、并被一起确认时，发送方只重发位图报告缺失的那几块，每一块仍受自己的尝试计数与年龄上限约束。本仿真器还没有建模这件事：一个聚合帧要么整体成功、要么整体失败。第二阶段的聚合课会补上它。',
    } },
  ],
  sources: [
    { en: 'The two counters are §10.23.2.2 of IEEE Std 802.11-2024: dot11ShortRetryLimit = 7 governs the per-MSDU discard, while the per-access-category QSRC drives CW = min(2·CW + 1, CWmax). 802.11-2016 also had a long-frame pair (SLRC, dot11LongRetryLimit = 4) above the RTS threshold; 802.11-2020 removed it.',
      zh: '两个计数器见 IEEE Std 802.11-2024 §10.23.2.2：dot11ShortRetryLimit = 7 决定每个 MSDU 何时被丢弃，而每个接入类别一个的 QSRC 驱动 CW = min(2·CW + 1, CWmax)。802.11-2016 还有一套用于长帧的 SLRC 与 dot11LongRetryLimit = 4（超过 RTS 门限时适用），802.11-2020 已删除。' },
    { en: 'Duplicate detection — transmitter address, sequence number and Retry = 1 — is §10.3.2.14; the MSDU lifetime is dot11EDCATableMSDULifetime.',
      zh: '重复帧检测（凭发送地址、序列号与 Retry = 1）见 §10.3.2.14；MSDU 生存期即 dot11EDCATableMSDULifetime。' },
    { en: 'The queue limit of 500 MSDUs, the 500 ms lifetime and the drop-newest policy are this simulator’s model choices, following ns-3’s WifiMacQueue; so are the seed, the hidden-node house and the 13.2 Mb/s video source.',
      zh: '500 个 MSDU 的队列上限、500 ms 的生存期与“丢弃新到者”的策略，都是本仿真器的模型取值，沿用 ns-3 的 WifiMacQueue；随机种子、隐藏节点户型与 13.2 Mb/s 的视频源同样如此。' },
  ],
  scenario: () => retriesScenario({ limit: 500, lifetimeMs: 500 }),
  variants: [
    {
      label: { en: 'Short queue: 100 MSDUs, 500 ms lifetime', zh: '短队列：100 个 MSDU，生存期 500 ms' },
      scenario: () => retriesScenario({ limit: 100, lifetimeMs: 500 }),
    },
    {
      label: { en: 'Short lifetime: 500 MSDUs, 100 ms lifetime', zh: '短生存期：500 个 MSDU，生存期 100 ms' },
      scenario: () => retriesScenario({ limit: 500, lifetimeMs: 100 }),
    },
  ],
  jumps: [
    J('first retry', '第一次重传', firstRetry),
    J('first retransmission (Retry bit set)', '第一次重发（Retry 位置位）', txOf((r) => r.frame.kind === 'data' && r.frame.retryFlag === true)),
    J('first retry-limit drop', '第一次因重传上限丢帧', dropOf('retryLimit')),
    J('first lifetime drop (Hidden B)', '第一次因生存期丢帧（Hidden B）', dropOf('lifetime', 'sta-2')),
    J('first queue-full drop (AP)', '第一次因队列满丢帧（AP）', dropOf('queueFull', 'ap')),
    J('first lifetime drop at the AP', 'AP 第一次因生存期丢帧', dropOf('lifetime', 'ap')),
  ],
  observe: [
    { en: 'At the give-up at 27 689 µs, Hidden B logs the drop and a window reset to 15 in one instant; its next frame carries sequence number 1 and a clear repeat bit.', zh: '27 689 µs 放弃那一帧时，Hidden B 同一瞬间记下丢弃与窗口复位为 15；它的下一帧序列号是 1，重复标志清零。' },
    { en: 'Select the AP and play. The queue count climbs for two seconds and the head frame ages towards 500 ms; after the first queue-full drop at 1 963 852 µs the two losses alternate.', zh: '选中 AP 并播放。队列计数涨了两秒，队首帧的年龄逼近 500 ms；1 963 852 µs 第一次队列满丢帧后，两种损失交替出现。' },
    { en: 'Jump to Hidden B’s first lifetime drop: three frames go at one instant, all queued since the start of the run, none of them ever sent.', zh: '跳到 Hidden B 第一次因生存期丢帧：三帧在同一瞬间被丢掉，它们从仿真开始就在队列里，一次都没发出去过。' },
  ],
  tryThis: [
    { en: 'Load each variant and look for the AP’s first queue-full and first lifetime drop. Predict which one each variant lacks, and why all three runs still deliver 2644 frames.', zh: '依次载入两个变体，去找 AP 第一次队列满丢帧与第一次生存期丢帧。先预测每个变体缺哪一种，以及为什么三次运行送达的都是 2644 帧。' },
    { en: 'In the editor set the RTS threshold to 500 B — the cure the hidden-node lesson gave you — and reload. Watch the uploaders’ give-ups and the AP’s queue.', zh: '在编辑器里把 RTS 门限设为 500 B——隐藏节点那一课给你的解法——再重新载入。看看两台上传终端的“放弃”和 AP 的队列。' },
  ],
  quiz: [
    {
      q: { en: 'A frame has been sent seven times and still has no answer. What happens to it?', zh: '一帧已经发了七次，还是没有回答。它会怎么样？' },
      options: [
        { en: 'It waits at the front of the line until the channel is quieter', zh: '它留在队首，等信道安静一些' },
        { en: 'It is given up, and the frame behind it moves to the front', zh: '它被放弃，后面那一帧挪到队首' },
        { en: 'It is sent once more at the lowest rate', zh: '它再以最低速率发一次' },
      ],
      answer: 1,
      explain: { en: 'Seven is the retry limit, and the queue behind has already paid for every one of those attempts.', zh: '七就是重传上限，而后面整条队列已经为这七次尝试买了单。' },
    },
    {
      q: { en: 'Your AP’s log fills with queueFull. What is the diagnosis?', zh: 'AP 的日志里满是 queueFull。诊断是什么？' },
      options: [
        { en: 'The link to that client is failing', zh: '到那个客户端的链路在失败' },
        { en: 'The frames are stale', zh: '这些帧已经过时' },
        { en: 'More traffic is offered than the channel can carry', zh: '交下来的流量超过了信道能搬走的量' },
      ],
      answer: 2,
      explain: { en: 'Arrivals outpace departures. A failing link shows up as retryLimit instead, staleness as lifetime.', zh: '到达的速度快过离开的速度。链路失败表现为 retryLimit，数据过时表现为 lifetime。' },
    },
    {
      q: { en: 'You raise the queue from 100 frames to 500. What changes?', zh: '你把队列从 100 帧加大到 500 帧。会有什么变化？' },
      options: [
        { en: 'The AP delivers more frames', zh: 'AP 送达的帧更多了' },
        { en: 'The same 2644 get through, later, and the loss moves from the door to the clock', zh: '送达的还是那 2644 帧，只是更晚，损失从门口挪到了钟上' },
        { en: 'Nothing at all', zh: '什么都不会变' },
      ],
      answer: 1,
      explain: { en: 'A bigger buffer cannot make airtime, only hold frames longer: the mean wait over the last second rises from 117 ms to 472 ms.', zh: '更大的缓冲区造不出空口时间，只会让帧等得更久。最后一秒的平均等待从 117 ms 升到 472 ms。' },
    },
  ],
}
