/**
 * Tier 1 · M2 · Retries, drops and queues.
 *
 * The hidden-node house again, all legacy (DCF): two saturated uploaders that
 * cannot hear each other lose frames at the retry limit, and a TV streaming
 * ~13 Mb/s of video from the AP offers more than the shared channel carries,
 * so the AP's queue grows until the queue limit and the MSDU lifetime bite.
 * Every number quoted below is pinned in tests/course/tier1-retries-queues.test.ts.
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
  body: [
    { text: {
      en: 'A MAC can neither retry nor queue forever. Three limits decide when a frame is given up, each with its own DROP reason. The scene: the hidden-node house, all legacy (DCF), Hidden A and Hidden B uploading flat out without hearing each other while a TV streams video from the AP.',
      zh: 'MAC 既不能无限重传，也不能无限排队。有三个上限决定一帧何时被放弃，各自留下不同的 DROP 原因。场景是隐藏节点户型，全部为传统设备（DCF）：Hidden A 与 Hidden B 互相听不见却都在满负荷上传，同时一台电视从 AP 接收视频流。',
    } },
    { kind: 'list', heading: { en: 'Two counters move on every failure (802.11-2020/2024 §10.23.2.2)', zh: '每次失败都有两个计数器在动（802.11-2020/2024 §10.23.2.2）' }, items: [
      { en: 'Each MSDU keeps its own retry count; at dot11ShortRetryLimit = 7 it is discarded — DROP, reason retryLimit.', zh: '每个 MSDU 都有自己的重传计数；达到 dot11ShortRetryLimit = 7 时被丢弃——DROP，原因 retryLimit。' },
      { en: 'Each access category keeps one QSRC: a failure adds one and doubles CW = min(2·CW + 1, CWmax), 15 → 31 → … → 1023. A success resets both, as does QSRC reaching the limit.', zh: '每个接入类别有一个 QSRC：失败一次加一并把 CW 翻倍——CW = min(2·CW + 1, CWmax)，即 15 → 31 → … → 1023。成功一次会让二者复位，QSRC 达到上限时也一样。' },
      { en: 'DCF has one queue and one counter, EDCA four. 802.11-2016 also had SSRC/SLRC and dot11LongRetryLimit = 4 above the RTS threshold; 802.11-2020 removed it.', zh: 'DCF 只有一个队列、一个计数器，EDCA 则有四套。802.11-2016 还有 SSRC/SLRC 以及超过 RTS 门限时适用的 dot11LongRetryLimit = 4；802.11-2020 已删除它。' },
    ] },
    { text: {
      en: 'A retransmission is the same MPDU again: same sequence number, Retry bit set. If only the ACK was lost, the receiver recognises the copy by transmitter address, sequence number and Retry = 1, re-acknowledges and discards it (§10.3.2.14 duplicate detection).',
      zh: '重传就是把同一个 MPDU 再发一遍：序列号不变，Retry 位置位。如果丢的只是 ACK，接收方会凭发送地址、序列号和 Retry = 1 认出副本，重新回 ACK 并丢弃它（§10.3.2.14 重复帧检测）。',
    } },
    { kind: 'table', heading: { en: 'Hidden B’s first frame: seven attempts, then DROP', zh: 'Hidden B 的第一帧：七次尝试，然后 DROP' }, head: [
      { en: 'Attempt', zh: '尝试' }, { en: 'TX start', zh: '发送开始' }, { en: 'Rate', zh: '速率' }, { en: 'Retry bit', zh: 'Retry 位' }, { en: 'Failure recorded', zh: '记录失败' }, { en: 'CW after', zh: '之后的 CW' },
    ], rows: [
      [N('1'), N('0 µs'), N('48 Mb/s'), N('0'), N('321 µs'), N('31')],
      [N('2'), N('526 µs'), N('48 Mb/s'), N('1'), N('847 µs'), N('63')],
      [N('3'), N('1683 µs'), N('36 Mb/s'), N('1'), N('2092 µs'), N('127')],
      [N('4'), N('4544 µs'), N('36 Mb/s'), N('1'), N('4953 µs'), N('255')],
      [N('5'), N('6999 µs'), N('24 Mb/s'), N('1'), N('7576 µs'), N('511')],
      [N('6'), N('13 632 µs'), N('24 Mb/s'), N('1'), N('14 209 µs'), N('1023')],
      [N('7'), N('26 940 µs'), N('18 Mb/s'), N('1'), { en: '27 689 µs — DROP retryLimit', zh: '27 689 µs——DROP retryLimit' }, N('15')],
    ] },
    { text: {
      en: 'All seven carry sequence number 0, each failure is recorded at its ACK timeout, and the rate controller steps down every second failure, so each retry is a longer target (276 → 704 µs). The next frame, sequence number 1, leaves at 27 741 µs, Retry bit clear. Such a drop means the link failed. Decoding here is deterministic until the PHY tier adds a PER model, so every failure comes from collisions or interference. Over 3 s Hidden A gets 76 frames through and loses 62 this way; Hidden B, 69 and 61.',
      zh: '七次发送的序列号都是 0，每次失败都在各自 ACK 超时处记录；速率控制每失败两次降一档，于是每次重传都是更长的“靶子”（276 → 704 µs）。下一帧（序列号 1）在 27 741 µs 发出，Retry 位清零。这种丢帧意味着链路失败了。在 PHY 阶段引入 PER 模型之前，这里的解码是确定性的，所以每次失败都来自碰撞或干扰。3 s 内 Hidden A 送达 76 帧、以此方式丢掉 62 帧；Hidden B 则是 69 与 61。',
    } },
    { heading: { en: 'When the retry count and QSRC disagree', zh: '当重传计数与 QSRC 不一致时' }, text: {
      en: 'Both counters move in lockstep — until 504 465 µs, when Hidden B’s head frame (sequence number 17, five failures behind it) and the two behind it are found older than 500 ms and dropped for lifetime. The next frame, sequence number 18, then fails with retries = 1 but QSRC = 6, CW 1023; its second failure takes QSRC to 7, so CW resets to 15 although the frame has used two of its seven attempts; its third reads retries = 3, QSRC = 1. All three expired frames had waited since t = 0 — head-of-line delay: a frame waits for every retry of every frame ahead of it.',
      zh: '同一队列只处理一帧时，两个计数器步调一致——直到 504 465 µs：Hidden B 的队头帧（序列号 17，已失败五次）连同其后两帧被发现排队超过 500 ms，一起因生存期到期被丢弃。接着下一帧（序列号 18）失败时 retries = 1 而 QSRC = 6，CW 为 1023；它第二次失败使 QSRC 达到 7，于是 CW 复位为 15，尽管这一帧七次机会才用掉两次；第三次失败则是 retries = 3、QSRC = 1。这三帧从 t = 0 起就在排队——这就是队头阻塞时延：一帧不仅要等信道，还要等排在它前面的每一帧的每一次重传。',
    } },
    { kind: 'list', heading: { en: 'Queues: how much, how long', zh: '队列：能放多少，能放多久' }, items: [
      { en: 'One transmit queue per access category; defaults follow ns-3’s WifiMacQueue.', zh: '每个接入类别一个发送队列；默认值沿用 ns-3 的 WifiMacQueue。' },
      { en: 'Queue limit 500 MSDUs: an arrival finding it full is dropped, never queued (DROP_NEWEST) — DROP queueFull, no ENQUEUE record.', zh: '队列上限 500 个 MSDU：到达时队列已满的帧直接被丢弃、从不入队（DROP_NEWEST）——DROP queueFull，没有 ENQUEUE 记录。' },
      { en: 'MSDU lifetime 500 ms (dot11EDCATableMSDULifetime): an older MSDU goes when the MAC next builds a transmission from that queue — DROP lifetime, then DEQUEUE. Frames expire in batches.', zh: 'MSDU 生存期 500 ms（dot11EDCATableMSDULifetime）：更老的 MSDU 会在 MAC 下一次从该队列组织发送时被丢弃——DROP lifetime，随后 DEQUEUE。帧因此成批过期。' },
    ] },
    { heading: { en: 'Offered load above capacity: the queue fills', zh: '供给负载超过容量：队列被填满' }, text: {
      en: 'In 3 s the video offers the AP 3541 MSDUs of 1400 B (13.2 Mb/s); sharing the channel with two stations stuck at long, colliding frames, it gets 2644 acknowledged (9.9 Mb/s):',
      zh: '3 s 内视频向 AP 供给 3541 个 1400 B 的 MSDU（13.2 Mb/s）；AP 要与两台卡在又长又爱碰撞的帧上的终端共享信道，最终只有 2644 帧被确认（9.9 Mb/s）：',
    } },
    { kind: 'table', head: [
      { en: 'Delivered during', zh: '送达时段' }, { en: 'Mean queue-to-ACK delay', zh: '入队到 ACK 的平均时延' },
    ], rows: [
      [N('0–0.5 s'), N('19 ms')],
      [N('0.5–1 s'), N('149 ms')],
      [N('1–1.5 s'), N('228 ms')],
      [N('1.5–2 s'), N('324 ms')],
      [N('2–2.5 s'), N('472 ms')],
      [N('2.5–3 s'), N('472 ms')],
    ] },
    { text: {
      en: 'At 1 963 852 µs the queue holds 500 MSDUs and the next video frame is refused — the first queueFull drop. At 2 182 806 µs the lifetime bites too: four frames aged 500.2 to 502.6 ms go at once, and the delay stops growing there.',
      zh: '在 1 963 852 µs，队列已存有 500 个 MSDU，下一个视频帧被拒之门外——第一次 queueFull 丢帧。到 2 182 806 µs 生存期也开始起作用：四个已排队 500.2 至 502.6 ms 的帧同时被丢，时延到此不再增长。',
    } },
    { kind: 'table', heading: { en: 'Three drop reasons, three diagnoses', zh: '三种丢帧原因，三种诊断' }, head: [
      { en: 'reason', zh: 'reason' }, { en: 'Fires when', zh: '触发条件' }, { en: 'It means', zh: '含义' },
    ], rows: [
      [N('retryLimit'), { en: 'one MSDU’s 7th attempt fails', zh: '同一 MSDU 第 7 次尝试失败' }, { en: 'Link failure. Fix the link: RTS/CTS, placement, rate.', zh: '链路失败。要修的是链路：RTS/CTS、摆放位置、速率。' }],
      [N('lifetime'), { en: 'it has waited over 500 ms', zh: '它已等待超过 500 ms' }, { en: 'Stale data — a late voice or game packet is worthless, so dropping it is right.', zh: '数据已过时——迟到的语音或游戏包毫无价值，丢掉它是对的。' }],
      [N('queueFull'), { en: 'an arrival finds 500 queued', zh: '到达时队列里已有 500 帧' }, { en: 'Overload. Only less load or more capacity helps.', zh: '过载。只有减负或扩容才有用。' }],
    ] },
    { heading: { en: 'The knobs move losses, not capacity', zh: '旋钮只挪动损失，不增加容量' }, text: {
      en: 'The variants change only the queue settings — a short queue is the quick way to watch overload, since the default takes almost two seconds to fill. The AP delivers the same 2644 frames in every run:',
      zh: '两个变体只改队列设置——想快速看到过载就把队列改短，因为默认队列要将近两秒才填满。三次运行中 AP 送达的都是同样的 2644 帧：',
    } },
    { kind: 'table', head: [
      { en: 'Run', zh: '运行' }, { en: 'First queueFull', zh: '首次 queueFull' }, { en: 'First AP lifetime drop', zh: 'AP 首次 lifetime 丢帧' }, { en: 'Mean delay, last second', zh: '最后一秒平均时延' },
    ], rows: [
      [{ en: 'Defaults (500, 500 ms)', zh: '默认（500，500 ms）' }, N('1 963 852 µs'), N('2 182 806 µs'), N('472 ms')],
      [{ en: 'Short queue (100)', zh: '短队列（100）' }, N('529 728 µs'), { en: 'never', zh: '从未' }, { en: '117 ms (max 213 ms)', zh: '117 ms（最大 213 ms）' }],
      [{ en: 'Short lifetime (100 ms)', zh: '短生存期（100 ms）' }, { en: 'never', zh: '从未' }, N('588 851 µs'), { en: '88 ms (max 101 ms)', zh: '88 ms（最大 101 ms）' }],
    ] },
    { text: {
      en: '100 frames at 881 delivered per second is about 113 ms of traffic. With the short lifetime a delivered frame can still be 101 ms old: the age is checked before a transmission, so its ACK lands just past the limit.',
      zh: '按每秒送达 881 帧计，100 帧约合 113 ms 的流量。短生存期下，送达的帧仍可能已有 101 ms：年龄在发送前检查，ACK 会稍越过上限才到。',
    } },
    { text: {
      en: 'Under a Block Ack agreement the rules differ: the originator retransmits only the MPDUs the BlockAck bitmap reports missing, each still bound by its retry count and lifetime. This simulator does not model Block Ack agreements yet — an A-MPDU succeeds or fails as a whole; the Tier 2 aggregation lesson adds them.',
      zh: '在 Block Ack 协议下规则不同：发起方只重传 BlockAck 位图报告缺失的 MPDU，每个仍受自己的重传计数与生存期约束。本模拟器尚未建模 Block Ack 协议——这里的 A-MPDU 要么整体成功、要么整体失败；第二阶段的聚合课会加入它。',
    } },
    { kind: 'list', heading: { en: 'Where to read it', zh: '在哪里看' }, items: [
      { en: 'The log prints “retry #id (retries=7 QSRC=7)” and “DROP #id (reason)”; frame detail shows Sequence number and Retry flag.', zh: '日志显示“retry #id (retries=7 QSRC=7)”与“DROP #id (reason)”；帧详情显示 Sequence number 与 Retry flag。' },
      { en: 'Inspector: the QSRC row is the live per-access-category retry counter, “retries / drops” counts all three reasons, and the queue list shows each frame’s age.', zh: '检视器：QSRC 一行是该接入类别当前的重传计数器，“重传 / 丢弃”统计三种原因的丢帧总数，队列列表显示每帧已排队多久。' },
    ] },
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
    { en: 'At the first retry-limit drop (27 689 µs) Hidden B logs retries=7 QSRC=7, DROP (retryLimit) and CW → 15 together, and its next frame shows sequence number 1 with Retry flag 0.', zh: '第一次因重传上限丢帧（27 689 µs）处，Hidden B 同时记下 retries=7 QSRC=7、DROP (retryLimit) 和 CW → 15；它的下一帧序列号为 1、Retry flag 为 0。' },
    { en: 'Jump to Hidden B’s first lifetime drop and step forward: three DROP (lifetime) lines at one instant, then RETRY records reading retries=1 QSRC=6, retries=2 QSRC=7, retries=3 QSRC=1 — the per-MSDU counter and QSRC apart.', zh: '跳到 Hidden B 第一次因生存期丢帧并往后步进：同一瞬间三条 DROP (lifetime)，随后的 RETRY 记录依次是 retries=1 QSRC=6、retries=2 QSRC=7、retries=3 QSRC=1——每帧计数与 QSRC 就此分道扬镳。' },
    { en: 'Select the AP and play: the queue count climbs, the head frame’s age approaches 500 ms, and after the first queue-full drop at 1 963 852 µs both drop reasons alternate.', zh: '选中 AP 并播放：队列计数不断上涨，队头帧的等待时间逼近 500 ms；1 963 852 µs 第一次队列满丢帧之后，两种丢帧原因交替出现。' },
  ],
  tryThis: [
    { en: 'Load each variant and jump to the AP’s first queue-full and first lifetime drop. Predict which one each variant lacks, and why the AP still delivers the same 2644 frames.', zh: '依次载入两个变体，跳到 AP 第一次队列满丢帧与第一次生存期丢帧。先预测每个变体缺了哪一种、以及为什么 AP 送达的仍是同样的 2644 帧。' },
    { en: 'In the editor set the RTS threshold to 500 B — the cure from the hidden-node lesson — and reload. Watch the stations’ retry-limit drops and the AP’s queue.', zh: '在编辑器中把 RTS 门限设为 500 B——隐藏节点课里的解法——后重新载入。观察两台终端的重传上限丢帧与 AP 的队列。' },
  ],
  quiz: [
    {
      q: { en: 'A station’s QSRC has just reached 7, but its head frame has failed only twice. What happens?', zh: '某终端的 QSRC 刚达到 7，但其队头帧只失败过两次。会发生什么？' },
      options: [
        { en: 'The frame is dropped for reaching the retry limit', zh: '该帧因达到重传上限被丢弃' },
        { en: 'QSRC and CW reset (CW = 15); the frame stays queued, with five attempts left', zh: 'QSRC 与 CW 复位（CW = 15）；该帧留在队列中，还剩五次尝试' },
        { en: 'CW stays at 1023 until the frame succeeds', zh: 'CW 保持 1023，直到该帧成功' },
      ],
      answer: 1,
      explain: { en: 'The drop decision uses the MSDU’s own retry count; QSRC only drives CW. Hidden B shows exactly this at retries=2 QSRC=7.', zh: '是否丢帧看的是 MSDU 自己的重传计数；QSRC 只驱动 CW。Hidden B 在 retries=2 QSRC=7 处正是如此。' },
    },
    {
      q: { en: 'Your AP’s log fills with DROP (queueFull). What is the diagnosis?', zh: 'AP 的日志里满是 DROP (queueFull)。诊断是什么？' },
      options: [
        { en: 'The link to the client is failing', zh: '到客户端的链路在失败' },
        { en: 'The frames are stale', zh: '帧已经过时' },
        { en: 'Offered load exceeds what the channel carries for that queue', zh: '供给负载超过信道能为该队列承载的量' },
      ],
      answer: 2,
      explain: { en: 'Arrivals outpace departures. Link failure shows up as retryLimit, staleness as lifetime.', zh: '到达快于离开。链路失败表现为 retryLimit，数据过时表现为 lifetime。' },
    },
    {
      q: { en: 'The TV stream is overloaded. You raise the queue limit from 100 to 500 MSDUs. What changes?', zh: '电视视频流过载。你把队列上限从 100 提高到 500 个 MSDU。会有什么变化？' },
      options: [
        { en: 'The AP delivers more frames', zh: 'AP 送达的帧更多' },
        { en: 'The same 2644 frames get through, later, and the losses move from queueFull to lifetime', zh: '送达的仍是那 2644 帧，但到得更晚，损失也从 queueFull 转移到 lifetime' },
        { en: 'Nothing at all', zh: '没有任何变化' },
      ],
      answer: 1,
      explain: { en: 'A bigger buffer cannot create airtime; it only holds frames longer — the mean delay over the last second rises from 117 ms to 472 ms.', zh: '更大的缓冲区造不出空口时间，只会让帧等得更久——最后一秒的平均时延从 117 ms 升到 472 ms。' },
    },
  ],
}
