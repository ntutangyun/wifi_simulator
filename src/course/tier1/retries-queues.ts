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
  minutes: 35,
  title: { en: 'Retries, drops and queues', zh: '重传、丢帧与队列' },
  body: [
    { text: {
      en: 'So far a failed frame was simply sent again. A real MAC cannot retry forever, and it cannot queue forever either. Three limits decide when a frame is given up, and each one leaves a DROP record with its own reason: the retry limit, the queue limit and the MSDU lifetime.',
      zh: '到目前为止，失败的帧只是被再发一次。可真实的 MAC 既不能无限重传，也不能无限排队。有三个上限决定一帧何时被放弃，每一个都会留下带有各自原因的 DROP 记录：重传上限、队列上限和 MSDU 生存期。',
    } },
    { text: {
      en: 'The scene is the hidden-node house you already know, with every device legacy (DCF): Hidden A and Hidden B upload flat out from rooms that cannot hear each other, and a TV next to Hidden A streams video from the AP in the hallway.',
      zh: '场景还是你熟悉的隐藏节点户型，所有设备都是传统设备（DCF）：Hidden A 和 Hidden B 分处两个互相听不见的房间，满负荷上传；Hidden A 旁边的电视从走廊里的 AP 接收视频流。',
    } },
    { kind: 'list', heading: { en: 'Two counters move on every failure (802.11-2020/2024 §10.23.2.2)', zh: '每次失败都有两个计数器在动（802.11-2020/2024 §10.23.2.2）' }, items: [
      { en: 'Each MSDU keeps its own retry count. A failed attempt adds one; when the count reaches dot11ShortRetryLimit = 7 the MSDU is discarded — DROP, reason retryLimit.', zh: '每个 MSDU 都有自己的重传计数。每失败一次加一；计数达到 dot11ShortRetryLimit = 7 时，该 MSDU 被丢弃——DROP，原因 retryLimit。' },
      { en: 'Each access category keeps one QSRC (QoS short retry counter). Every failure in that AC adds one and doubles CW, CW = min(2·CW + 1, CWmax). A success resets QSRC to 0 and CW to CWmin; so does QSRC reaching the retry limit.', zh: '每个接入类别有一个 QSRC（QoS 短重传计数器）。该 AC 每失败一次加一，并把 CW 翻倍：CW = min(2·CW + 1, CWmax)。成功一次，QSRC 清零、CW 回到 CWmin；QSRC 达到重传上限时也一样。' },
    ] },
    { kind: 'formula', text: {
      en: 'CW after k consecutive failures: 15 → 31 → 63 → 127 → 255 → 511 → 1023, then back to 15 at k = 7',
      zh: '连续失败 k 次后的 CW：15 → 31 → 63 → 127 → 255 → 511 → 1023，k = 7 时回到 15',
    }, note: {
      en: 'A legacy DCF station has a single queue and a single counter; under EDCA there are four of each.',
      zh: '传统 DCF 终端只有一个队列、一个计数器；EDCA 下各有四个。',
    } },
    { text: {
      en: '802.11-2016 counted differently: a station had two counters, SSRC and SLRC, and two limits — dot11ShortRetryLimit (7) for frames up to the RTS threshold and dot11LongRetryLimit (4) for longer ones. 802.11-2020 removed dot11LongRetryLimit; since then every MSDU counts against the one limit, whatever its size.',
      zh: '802.11-2016 的计法不同：终端有两个计数器 SSRC 和 SLRC，以及两个上限——不超过 RTS 门限的帧用 dot11ShortRetryLimit（7），更长的帧用 dot11LongRetryLimit（4）。802.11-2020 删除了 dot11LongRetryLimit；从此每个 MSDU 不论长短都只按这一个上限计数。',
    } },
    { text: {
      en: 'A retransmission is the same MPDU sent again: it keeps its sequence number and sets the Retry bit in Frame Control. If only the ACK was lost, the receiver already has the frame; it recognises the copy by transmitter address, sequence number and Retry = 1, acknowledges it again and discards it (§10.3.2.14 duplicate detection).',
      zh: '重传就是把同一个 MPDU 再发一遍：序列号不变，并在 Frame Control 中置位 Retry 位。如果丢的只是 ACK，接收方其实已经收到了这一帧；它凭发送地址、序列号和 Retry = 1 认出这份副本，再回一次 ACK，然后丢弃副本（§10.3.2.14 重复帧检测）。',
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
      en: 'All seven carry sequence number 0. Each failure is detected at the end of its ACK timeout, and the rate controller steps down after every second failure, so each later attempt is a longer target: 276 µs of airtime at 48 Mb/s, 704 µs at 18 Mb/s. The next frame, sequence number 1, leaves at 27 741 µs with the Retry bit clear and CW back at 15.',
      zh: '这七次发送的序列号都是 0。每次失败都在各自 ACK 超时结束时才被发现；速率控制每失败两次就降一档，所以后面的尝试是更长的“靶子”：48 Mb/s 时空口 276 µs，18 Mb/s 时 704 µs。下一帧（序列号 1）在 27 689 µs 之后的 27 741 µs 发出，Retry 位清零，CW 回到 15。',
    } },
    { text: {
      en: 'A retry-limit drop means the link failed: the frame was sent seven times and never acknowledged. Keep in mind that decoding in this simulator is deterministic until the PER model arrives in the PHY tier, so every failure here comes from collisions or interference, not from random bit errors. Over 3 s, Hidden A gets 76 frames through and loses 62 at the retry limit; Hidden B gets 69 through and loses 61.',
      zh: '因重传上限丢帧，说明链路失败了：这一帧发了七次，一次也没被确认。注意：在 PHY 阶段引入 PER 模型之前，本模拟器的解码是确定性的，所以这里的每次失败都来自碰撞或干扰，而不是随机误码。3 s 内，Hidden A 送达 76 帧、因重传上限丢掉 62 帧；Hidden B 送达 69 帧、丢掉 61 帧。',
    } },
    { heading: { en: 'When the retry count and QSRC disagree', zh: '当重传计数与 QSRC 不一致时' }, text: {
      en: 'For one queue working on one frame, the two counters move in lockstep. At 504 465 µs they come apart. Hidden B’s head frame (sequence number 17) has failed five times, so QSRC is 5, when the MAC finds it and the two frames behind it older than 500 ms and drops all three for lifetime. The next frame, sequence number 18, fails once: its RETRY record reads retries = 1 but QSRC = 6, and CW jumps to 1023. After its second failure QSRC reaches 7, so CW resets to 15 — although the frame has used only two of its seven attempts. Its third failure reads retries = 3, QSRC = 1.',
      zh: '同一个队列只处理一帧时，这两个计数器步调一致。到 504 465 µs 它们分道扬镳：Hidden B 的队头帧（序列号 17）已失败五次，QSRC 为 5；这时 MAC 发现它和紧随其后的两帧都已排队超过 500 ms，三帧一起因生存期到期被丢弃。下一帧（序列号 18）失败一次，其 RETRY 记录是 retries = 1，而 QSRC = 6，CW 直接跳到 1023。第二次失败后 QSRC 达到 7，CW 复位为 15——尽管这一帧七次机会才用了两次。它第三次失败的记录是 retries = 3、QSRC = 1。',
    } },
    { text: {
      en: 'Those three frames had waited since t = 0, behind predecessors that each burned several attempts. That is head-of-line delay: a frame waits not only for the channel, but for every retry of every frame ahead of it.',
      zh: '这三帧从 t = 0 起就在排队，前面的帧每一个都耗掉了好几次尝试。这就是队头阻塞时延：一帧不仅要等信道，还要等排在它前面的每一帧的每一次重传。',
    } },
    { kind: 'list', heading: { en: 'Queues: how much, how long', zh: '队列：能放多少，能放多久' }, items: [
      { en: 'One transmit queue per access category (a legacy DCF node has one). Defaults follow ns-3’s WifiMacQueue.', zh: '每个接入类别一个发送队列（传统 DCF 节点只有一个）。默认值沿用 ns-3 的 WifiMacQueue。' },
      { en: 'Queue limit: 500 MSDUs. An arrival that finds the queue full is dropped and never queued (DROP_NEWEST) — DROP, reason queueFull, with no ENQUEUE record.', zh: '队列上限：500 个 MSDU。到达时队列已满的帧直接被丢弃，从不入队（DROP_NEWEST）——DROP，原因 queueFull，没有 ENQUEUE 记录。' },
      { en: 'MSDU lifetime: 500 ms (dot11EDCATableMSDULifetime). An MSDU queued longer is discarded when the MAC next builds a transmission from that queue — DROP, reason lifetime, then DEQUEUE. The check runs only then, so several frames often expire at the same instant.', zh: 'MSDU 生存期：500 ms（dot11EDCATableMSDULifetime）。排队超过此时长的 MSDU，会在 MAC 下一次从该队列组织发送时被丢弃——DROP，原因 lifetime，随后 DEQUEUE。检查只在那一刻进行，所以常常有好几帧在同一瞬间过期。' },
    ] },
    { heading: { en: 'Offered load above capacity: the queue fills', zh: '供给负载超过容量：队列被填满' }, text: {
      en: 'In 3 s the video offers the AP 3541 MSDUs of 1400 B, about 13.2 Mb/s. Sharing the channel with two stations stuck at long, colliding frames, the AP gets 2644 of them acknowledged, about 9.9 Mb/s. The surplus waits in the queue, and the delay of every delivered frame grows with it:',
      zh: '3 s 内视频流向 AP 供给 3541 个 1400 B 的 MSDU，约 13.2 Mb/s。AP 要与两台卡在又长又爱碰撞的帧上的终端共享信道，最终只有 2644 帧被确认，约 9.9 Mb/s。多出来的部分在队列里等待，每一帧送达时的时延随之增长：',
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
      en: 'At 1 963 852 µs the queue holds 500 MSDUs and the next video frame is refused: the first queueFull drop. At 2 182 806 µs the lifetime bites as well: four frames aged 500.2 to 502.6 ms are dropped at once. From then on the delay stops growing, because nothing older than 500 ms is ever sent.',
      zh: '在 1 963 852 µs，队列已存有 500 个 MSDU，下一个视频帧被拒之门外：第一次 queueFull 丢帧。到 2 182 806 µs，生存期也开始起作用：四个已排队 500.2 到 502.6 ms 的帧同时被丢弃。此后时延不再增长，因为超过 500 ms 的帧再也不会被发出。',
    } },
    { kind: 'table', heading: { en: 'Three drop reasons, three diagnoses', zh: '三种丢帧原因，三种诊断' }, head: [
      { en: 'reason', zh: 'reason' }, { en: 'Fires when', zh: '触发条件' }, { en: 'It means', zh: '含义' },
    ], rows: [
      [N('retryLimit'), { en: 'the 7th attempt of one MSDU fails', zh: '同一 MSDU 第 7 次尝试失败' }, { en: 'Link failure: the receiver cannot be reached, or collisions keep killing the frame. Fix the link (RTS/CTS, placement, rate).', zh: '链路失败：接收方够不着，或碰撞反复毁掉这一帧。要修的是链路（RTS/CTS、摆放位置、速率）。' }],
      [N('lifetime'), { en: 'the MSDU has waited over 500 ms when the MAC next builds a transmission', zh: 'MAC 下一次组织发送时，该 MSDU 已等待超过 500 ms' }, { en: 'Stale data. For voice or a game a late packet is worthless, so discarding it is the right call — and frees airtime for fresh ones.', zh: '数据已过时。对语音或游戏而言迟到的包毫无价值，丢掉它是正确的——还能把空口让给新鲜的包。' }],
      [N('queueFull'), { en: 'an arrival finds 500 MSDUs queued', zh: '到达时队列里已有 500 个 MSDU' }, { en: 'Overload: offered load exceeds what the link carries. Only less load or more capacity helps.', zh: '过载：供给负载超过链路承载能力。只有减负或扩容才有用。' }],
    ] },
    { heading: { en: 'The knobs move losses, not capacity', zh: '旋钮只会挪动损失，不会增加容量' }, text: {
      en: 'The two variants change only the queue settings. With a 100-MSDU queue, overflow starts at 529 728 µs instead of after almost two seconds — which is why a short queue is the quick way to watch overload; the AP never drops for lifetime, and no delivered frame waits longer than 213 ms, near the 113 ms that 100 frames at 881 delivered per second represent. With a 100 ms lifetime the queue never fills, lifetime drops start at 588 851 µs, and no delivered frame waits more than 101 ms: the check runs before a transmission, so the ACK can land just after the limit. Over the last second of the run the mean queue-to-ACK delay is 472 ms at the defaults, 117 ms with the short queue and 88 ms with the short lifetime — and in all three runs the AP delivers exactly 2644 frames. The queue decides which frames are lost and how stale the delivered ones are — never how many get through.',
      zh: '两个变体只改队列设置。队列上限改为 100 个 MSDU 时，溢出从 529 728 µs 就开始，而不必等上将近两秒——所以想快速看到过载，就把队列改短；此时 AP 再也没有因生存期丢帧，送达的帧没有一个等待超过 213 ms，与 100 帧按每秒送达 881 帧折算出的 113 ms 相当。生存期改为 100 ms 时，队列从未满过，生存期丢帧从 588 851 µs 开始，送达的帧没有一个等待超过 101 ms：检查发生在发送之前，所以 ACK 可能恰好在上限之后才到。运行的最后一秒里，入队到 ACK 的平均时延在默认设置下是 472 ms，短队列下是 117 ms，短生存期下是 88 ms——而三次运行中 AP 送达的帧数都恰好是 2644。队列决定丢哪些帧、送达的帧有多陈旧——但从不决定能送出去多少。',
    } },
    { text: {
      en: 'Under a Block Ack agreement the rules change: the originator retransmits only the MPDUs the BlockAck bitmap reports missing, each still bound by its retry count and lifetime, and the receiver reorders them. This simulator does not model Block Ack agreements yet — an A-MPDU here succeeds or fails as a whole. The Tier 2 aggregation lesson adds them.',
      zh: '在 Block Ack 协议下规则有所不同：发起方只重传 BlockAck 位图中报告缺失的 MPDU，每个 MPDU 仍受自己的重传计数和生存期约束，接收方负责重新排序。本模拟器尚未建模 Block Ack 协议——这里的 A-MPDU 要么整体成功、要么整体失败。第二阶段的聚合课会加入它。',
    } },
    { kind: 'list', heading: { en: 'Where to read it', zh: '在哪里看' }, items: [
      { en: 'RETRY record: retries is that MSDU’s count after this failure, qsrc the QSRC after it. The event log prints “retry #id (retries=7 QSRC=7)”.', zh: 'RETRY 记录：retries 是该 MSDU 本次失败后的计数，qsrc 是本次失败后的 QSRC。事件日志显示为“retry #id (retries=7 QSRC=7)”。' },
      { en: 'DROP record: reason is retryLimit, queueFull or lifetime; the log prints “DROP #id (reason)”.', zh: 'DROP 记录：reason 为 retryLimit、queueFull 或 lifetime；日志显示为“DROP #id (reason)”。' },
      { en: 'Inspector: the QSRC row shows the qsrc of the node’s latest RETRY record (a later success does not clear it); “retries / drops” counts drops of all three reasons; the queue list shows each frame’s age.', zh: '检视器：QSRC 一行显示该节点最近一条 RETRY 记录里的 qsrc（之后的成功不会把它清零）；“重传 / 丢弃”统计三种原因的丢帧总数；队列列表显示每帧已排队多久。' },
      { en: 'Frame detail of a data frame: Sequence number and Retry flag.', zh: '数据帧的帧详情：Sequence number（序列号）与 Retry flag（Retry 位）。' },
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
    { en: 'Jump to the first retry-limit drop: at 27 689 µs Hidden B logs retries=7 QSRC=7, DROP (retryLimit) and CW → 15 together; its next data frame carries sequence number 1 and Retry flag 0.', zh: '跳到第一次因重传上限丢帧：27 689 µs 处 Hidden B 同时记下 retries=7 QSRC=7、DROP (retryLimit) 和 CW → 15；它的下一个数据帧序列号为 1，Retry flag 为 0。' },
    { en: 'Jump to Hidden B’s first lifetime drop and step forward: three DROP (lifetime) lines at one instant, then RETRY records reading retries=1 QSRC=6, retries=2 QSRC=7, retries=3 QSRC=1.', zh: '跳到 Hidden B 第一次因生存期丢帧并往后步进：同一瞬间三条 DROP (lifetime)，随后的 RETRY 记录依次为 retries=1 QSRC=6、retries=2 QSRC=7、retries=3 QSRC=1。' },
    { en: 'Select the AP and play: its queue count climbs and the head frame’s age approaches 500 ms; after the first queue-full drop at 1 963 852 µs, queueFull and lifetime drops alternate.', zh: '选中 AP 并播放：队列计数不断上涨，队头帧的等待时间逼近 500 ms；在 1 963 852 µs 第一次队列满丢帧之后，queueFull 与 lifetime 两种丢帧交替出现。' },
  ],
  tryThis: [
    { en: 'Load each variant and jump to the AP’s first queue-full and first lifetime drop. Predict before you look which one each variant lacks, and why the AP still delivers the same 2644 frames in 3 s.', zh: '依次载入两个变体，分别跳到 AP 第一次队列满丢帧和第一次生存期丢帧。先预测每个变体缺了哪一种、为什么 AP 在 3 s 内仍然送达同样的 2644 帧，再去验证。' },
    { en: 'In the editor set the RTS threshold to 500 B (the cure from the hidden-node lesson) and reload. Watch what happens to Hidden A’s and Hidden B’s retry-limit drops, and to the AP’s queue.', zh: '在编辑器中把 RTS 门限设为 500 B（隐藏节点课里的解法）后重新载入。观察 Hidden A、Hidden B 的重传上限丢帧，以及 AP 的队列会怎样变化。' },
  ],
  quiz: [
    {
      q: { en: 'A station’s QSRC has just reached 7, but the frame at the head of its queue has failed only twice. What happens?', zh: '某终端的 QSRC 刚达到 7，但其队头帧只失败过两次。会发生什么？' },
      options: [
        { en: 'The frame is dropped for reaching the retry limit', zh: '该帧因达到重传上限被丢弃' },
        { en: 'QSRC and CW reset (CW = 15); the frame stays queued and may be tried up to five more times', zh: 'QSRC 与 CW 复位（CW = 15）；该帧留在队列中，最多还能再试五次' },
        { en: 'CW stays at 1023 until the frame succeeds', zh: 'CW 保持 1023，直到该帧成功' },
      ],
      answer: 1,
      explain: { en: 'The drop decision uses the MSDU’s own retry count; QSRC only drives CW and resets it at the limit. Hidden B shows exactly this at retries=2 QSRC=7.', zh: '是否丢帧看的是 MSDU 自己的重传计数；QSRC 只驱动 CW，并在达到上限时让 CW 复位。Hidden B 在 retries=2 QSRC=7 处正是如此。' },
    },
    {
      q: { en: 'Your AP’s log fills with DROP (queueFull). What is the diagnosis?', zh: 'AP 的日志里满是 DROP (queueFull)。诊断是什么？' },
      options: [
        { en: 'The link to the client is failing', zh: '到客户端的链路在失败' },
        { en: 'The frames are stale', zh: '帧已经过时' },
        { en: 'Offered load exceeds what the channel carries for that queue', zh: '供给负载超过信道能为该队列承载的量' },
      ],
      answer: 2,
      explain: { en: 'queueFull means arrivals outpace departures. Link failure shows up as retryLimit, staleness as lifetime.', zh: 'queueFull 意味着到达快于离开。链路失败表现为 retryLimit，数据过时表现为 lifetime。' },
    },
    {
      q: { en: 'The TV stream is overloaded. You raise the queue limit from 100 to 500 MSDUs. What changes?', zh: '电视视频流过载。你把队列上限从 100 提高到 500 个 MSDU。会有什么变化？' },
      options: [
        { en: 'The AP delivers more frames', zh: 'AP 送达的帧更多' },
        { en: 'The same 2644 frames get through, but they arrive later and the losses move from queueFull to lifetime', zh: '送达的仍是那 2644 帧，但到得更晚，损失也从 queueFull 转移到 lifetime' },
        { en: 'Nothing at all', zh: '没有任何变化' },
      ],
      answer: 1,
      explain: { en: 'A bigger buffer cannot create airtime. It only holds frames longer: over the last second the mean delay rose from 117 ms to 472 ms.', zh: '更大的缓冲区造不出空口时间，只会让帧等得更久：最后一秒的平均时延从 117 ms 升到 472 ms。' },
    },
  ],
}
