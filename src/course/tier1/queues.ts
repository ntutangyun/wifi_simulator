/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · the queue, the lifetime on every
 * frame in it, and the drop that happens when it is full.
 *
 * Re-worded on 2026-10-01 to docs/course-wording-contract.md: the title and the
 * prose named the two drops 门口 and 钟上; they now name the mechanisms —
 * 入队失败／队列溢出丢弃 and 生存期超时. No number, scenario, claim or `sources`
 * marker moved.
 *
 * The second half of `retries-queues`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M5). The
 * parent carried two rules the engine follows — one frame's seven attempts, and
 * what the line behind it does — and this lesson is the second: what a queue
 * holds, the lifetime every frame in it is under, and the three places a frame can
 * be given up.
 *
 * The scene is the parent's, unchanged and undivided
 * (`sameSceneAs: 'retries-queues'`), so the recorded timeline hashes of this id
 * are copies of `retries-queues`'s rather than new runs. It takes jumps 3–5 of
 * the old list (Hidden B's first lifetime drop, the access point's first
 * queue-full drop, the access point's first lifetime drop); the parent keeps the
 * retry, the Retry bit and the retry-limit drop.
 *
 * Fifteen pins arrive here from tests/course/retries-queues.test.ts, asserted
 * against the same three runs they always were: the queue defaults, the
 * three-drop-reason table, the three-setting comparison, the waiting-time table,
 * the 2644 frames all three runs deliver, the 987 aged uploads, the queue-full
 * instant and the lifetime instant, and the head-of-line depth. Nothing was
 * re-derived and nothing was relaxed.
 *
 * Its procedure is the queue's own, in the engine's order: `AcQueues.enqueue`
 * refusing an arrival at the limit with no ENQUEUE record at all (ns-3
 * DROP_NEWEST), `MacSim.purgeExpired` running before every transmission is
 * built and throwing out every frame past its lifetime — attempts included —
 * `AcQueues.claim` always taking the head, and `AcQueues.restore` putting a
 * failed frame back at the FRONT. The retry path went whole to the first half,
 * so neither half carries half a procedure.
 *
 * §4 gives this lesson no diagram: the three tables already show what a picture
 * would. §2 also deletes the parent's RTS-threshold experiment, which dragged
 * `hidden`'s mechanism into the middle of a queue lesson; it belongs in the
 * project.
 *
 * Every number quoted below is pinned in tests/course/queues.test.ts.
 */
import { J, type Lesson } from '../lessonKit'
import { dropOf, retriesScenario } from './retries-queues'

export const queues: Lesson = {
  id: 'queues',
  module: 4,
  title: '队列、生存期与队列溢出丢弃',
  why: '队首的一帧无法成功发送时，后面的所有帧都在等待，而上层应用并不会因此减少下发的数据。这条队列（queue）严格先进先出，失败的帧放回队首而不是队尾，所以一次重传（retry）真正的代价不是它自身占用的空口时间（airtime），而是给后面所有帧增加的等待。一帧被放弃有三种方式，各自说明不同的问题：同一帧用完七次尝试仍没有应答，说明链路（link）在失败；在队列中等待超过生存期（MSDU lifetime）——这里是半秒——说明数据已经过时，媒体访问控制（MAC）在发送之前就将其清除，这样的帧大多一次也没有获得发送机会；到达时队列已满、入队失败，说明下发的流量超过了信道的承载能力。把队列调短或把生存期调短，接入点（access point, AP）送达的帧数完全不变——能送出多少由信道决定，而不是由缓冲区决定。这些参数改变的只是在哪个环节放弃：队列变短，入队失败增加数倍，过时丢弃降为零；生存期变短，入队失败消失，过时丢弃增加数倍，发满七次的反而减少。反过来，把缓冲区加大，帧也只是等待得更久：送达帧的平均等待时间持续上升，最后稳定在略低于生存期的水平，因为超过生存期的帧根本不会被发出。',
  outcomes: [
    '说出一帧被放弃的三种原因，以及每一种说明了什么问题',
    '解释为什么“再发送一次”真正的代价由排在它后面的帧承担',
    '说明为什么把缓冲区加大，送达的帧数也不会增加',
  ],
  needs: ['retries-queues'],
  terms: [
    { term: 'queue', plain: '等待发送的帧序列，最早入队的排在最前面' },
    { term: 'lifetime', plain: '一帧在队列中允许等待的最长时间；超过后不再发送，直接丢弃' },
  ],
  picture: [
    { heading: '排在它后面的帧', text: '上层应用不断下发新的帧，它们排成一列等待发送，这就是队列（queue）。它们要等待信道——也要等待排在前面那一帧的每一次尝试。队首一帧无法发出，后面一百帧都随之阻塞。一次重传（retry）真正的代价，不是它自身占用的空口时间（airtime），而是它给其余所有帧增加的等待。' },
    { heading: '过时的数据没有发送价值', text: '所以每一帧除了尝试计数，还记录自己的入队时刻；从入队算起，它能在队列中停留的上限叫做生存期（MSDU lifetime）——这里是半秒。等待超过这个时长，媒体访问控制（MAC）就将其丢弃，不再给它发送的机会。对一个视频帧或一段语音采样来说这完全合理：它对应的播放时刻已经过去，延迟送达只会浪费空口时间。' },
    { kind: 'watch', jump: 0, heading: '观察三帧同时因生存期超时被丢弃', text: '载入仿真，跳到 Hidden B 第一次因生存期丢帧：三帧在同一时刻被丢弃，它们从仿真开始时起就在队列中，其中两帧一次也没有获得发送机会。' },
    { heading: '当队列已满', text: '队列还有一个长度上限。队列一满，新到的帧入队失败、立即被丢弃，连入队记录都没有。这是唯一一种与链路（link）无关、只与负载有关的损失：下发的流量超过了信道的承载能力，只有降低负载或提供更多空口时间才能解决。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一条队列的处理步骤', items: [
      '上层下发的一帧先检查队列是否还有空位：已有 500 帧在等待，它就入队失败、立即被丢弃，没有进入队列，所以不会有入队记录。否则它排到队尾，队列深度加一。',
      '每次组帧发送之前，MAC 先清理一遍这条队列：凡是入队至今超过生存期（这里是 500 ms）的帧，全部丢弃——无论它已经尝试过几次。接入点（access point, AP）丢弃的 194 帧中，有 188 帧一次也没有获得发送机会，另外 6 帧是尝试过、失败后又等待到超过生存期的。',
      '清理之后才从队首取帧，而取出的总是队首那一帧：这是一条严格先进先出的队列，队首帧发不出去，后面的帧都无法发送。',
      '一次尝试失败后，这些帧原样放回队首——而不是队尾。重传帧总是排在新帧前面，这也是队尾不断累积的原因。',
      '因此一帧离开队列只有四种方式：被确认；用完七次尝试后被放弃；在队列中超过生存期被清除；到达时队列已满、根本未能入队。第一种使队列变短，后三种是三种不同的故障。',
    ] },
    { kind: 'table', heading: '一帧被放弃的三种原因', head: [
      '日志记录', '触发条件', '它的含义',
    ], rows: [
      ['retryLimit', '同一帧的第七次尝试失败', '链路在失败——需要解决的是链路问题'],
      ['lifetime', '它在队列中等待超过 500 ms', '数据已经过时，丢弃它是正确的'],
      ['queueFull', '新帧到达时已有 500 帧在等待', '过载——需要降低负载或增加容量'],
    ] },
    { kind: 'table', heading: '同样的三秒，三种设置', head: [
      '运行', '入队失败', 'AP 处过时',
      '上传帧发满七次', 'AP 送达',
    ], rows: [
      ['默认：500 帧、500 ms', '213', '194', '123', '2644'],
      ['短队列：100 帧', '797', '0', '123', '2644'],
      ['短生存期：100 ms', '0', '770', '40', '2644'],
    ] },
    { heading: '这些参数无法改变的结果', text: '三次运行中 AP 送达的都是同一个数：2644 帧。队列调短是这个数，生存期调短也是这个数。原因很简单：队列只是帧排队等待的地方，它不产生空口时间。能送出多少由信道决定，而不是由缓冲区决定。' },
    { heading: '这些参数能改变的是「在哪个环节放弃」', text: '把队列调短，帧就在入队时被丢弃：入队失败从 213 增加到 797，而 AP 处过时丢弃从 194 降为 0——未能入队的帧不在队列中，也就不会在其中等待到超过生存期。把生存期调短，情况恰好相反：入队失败一次也没有，改由生存期超时丢弃，AP 处过时丢弃从 194 增加到 770。同样的三秒、同样的 2644 帧，只是损失发生的环节改变了。' },
    { heading: '表中看不到的一项连带影响', text: '短生存期那一次，两台上传站点（STA）有 987 帧因生存期超时被丢弃，默认设置下这个数不到 20。而同一次运行中，它们「发满七次」的帧反而从 123 降到 40：生存期先一步把帧丢弃，它们来不及用完七次尝试。所以上表那一列统计的是「发满七次」，与这 987 帧不是同一种放弃——调整一个参数，有时会连带改变另一种损失的数目。' },
    { kind: 'table', heading: '送达帧的等待时间', head: [
      '送达时段', '平均等待，默认',
    ], rows: [
      ['0–0.5 s', '19 ms'],
      ['0.5–1 s', '149 ms'],
      ['1–1.5 s', '228 ms'],
      ['1.5–2 s', '324 ms'],
      ['2–2.5 s', '472 ms'],
      ['2.5–3 s', '472 ms'],
    ] },
    { heading: '等待时间为什么不再增加', text: '前两秒等待时间持续上升，之后稳定在 472 ms：此时，等待超过 500 ms 的帧根本不会被发出。' },
  ],
  deeper: [
    { heading: '队头阻塞', text: '那三帧从仿真开始时起就在队列中。排在最前面的那一帧（序列号 17）用掉了五次尝试，而后面两帧一次也没有获得发送机会——它们本身没有任何问题，只是排在一个无法发出的帧后面。这三帧最后都是因为超过生存期被丢弃的，而不是因为信道。这就是本场景中最典型的队头阻塞实例。' },
  ],
  limits: [
    { kind: 'model-value', text: '500 帧的队列上限、500 ms 的生存期与「队满时丢弃新到的那一帧」都是引擎的取值，沿用 ns-3 的 WifiMacQueue（queues.ts 的 DEFAULT_QUEUE_LIMIT 与 DEFAULT_MSDU_LIFETIME_NS）。标准只规定 dot11EDCATableMSDULifetime 这个变量存在，既不规定队列长度，也不规定队满时丢弃哪一端。真实设备常常丢弃最早入队的那一批——也就是队首一端，而不是新到的一端——或者根本不丢弃，而是让上层自行降速。' },
    { kind: 'unmodelled', text: '一个接入类别只有一条队列，而且这条队列对所有接收端是同一条先进先出的队列：取帧时总是先看队首那一帧发给谁（AcQueues.claim）。于是一个无法送达的对端会阻塞同一类别中发往其他对端的所有帧。真实驱动按「接收端 + 业务类型」分别排队，可以跳过阻塞的那一个、先服务其他对端，所以本课中的队头阻塞比真实设备中的严重。' },
    { kind: 'unmodelled', text: '队列中没有任何主动队列管理：不按排队时延提前丢包，也不做流级公平排队，只有「队列满了就丢弃新到的帧」与「超过生存期就清除」这两种手段。真实家用路由器上的 CoDel 与 FQ-CoDel 正是为解决那张表中 472 ms 的等待而设计的：它们在队列尚未排满时就开始丢包，把时延降回几十毫秒。' },
    { kind: 'out-of-scope', until: 'wan-rtt', text: '业务源的发送节奏没有反馈：饱和上传在每次出队时立即补充一帧（traffic.ts 的 refill），视频按自己的时钟每 747 µs 加 0–200 µs 抖动产生一个 1400 字节的帧，无论队列中已经积压了多少。场景中加入一台服务器之后会出现另一种反馈：应答要等请求被确认后才会到来，请求丢失则不会有应答（「云端往返」那一课）。真实的 TCP 需要的是第三种——它会因丢包与时延而自行降速，而引擎没有实现这一种。所以「把缓冲区加大，送达的帧数也不会增加」这条结论在本模型中是绝对的，在真实网络中只是大致成立。' },
  ],
  sources: [
    'MSDU 生存期即 IEEE Std 802.11-2024 的 dot11EDCATableMSDULifetime；每个接入类别一条传输队列见 §10.23.2。标准并不规定队列多长，也不规定队满时丢哪一头。',
    '500 个 MSDU 的队列上限、500 ms 的生存期与“丢弃新到者”（ns-3 的 DROP_NEWEST）都是本仿真器的模型取值，沿用 ns-3 的 WifiMacQueue；随机种子、隐藏节点户型与 13.2 Mb/s 的视频源同样如此。',
    '“发送之前先清除过期帧”是 src/engine/mac.ts 里 transmitFor 的第一步，所以一帧可以在从未发送过的情况下过期——上面的 188 帧就是这样产生的。',
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
    J('第一次因生存期丢帧（Hidden B）', dropOf('lifetime', 'sta-2')),
    J('第一次因队列满丢帧（AP）', dropOf('queueFull', 'ap')),
    J('AP 第一次因生存期丢帧', dropOf('lifetime', 'ap')),
  ],
  observe: [
    '选中 AP 并播放。队列计数持续增加了两秒，队首帧的已排队时长接近 500 ms；1 963 852 µs 第一次因队列满丢帧后，两种损失交替出现。',
    '2 182 806 µs 处 AP 一次丢弃四帧，已排队时长在 500.2 到 502.6 ms 之间——生存期是逐帧计算的。',
  ],
  tryThis: [
    '依次载入两个变体，查找 AP 第一次因队列满丢帧与第一次因生存期丢帧。先预测每个变体缺少哪一种，以及为什么三次运行送达的都是 2644 帧。',
  ],
  quiz: [
    {
      q: 'AP 的日志中大量出现 queueFull。应作何诊断？',
      options: [
        '到那个客户端的链路在失败',
        '这些帧已经过时',
        '下发的流量超过了信道的承载能力',
      ],
      answer: 2,
      explain: '帧到达的速度超过离开的速度。链路失败表现为 retryLimit，数据过时表现为 lifetime。',
    },
    {
      q: '把队列从 100 帧加大到 500 帧，会有什么变化？',
      options: [
        'AP 送达的帧更多了',
        '送达的仍是那 2644 帧，只是更晚，损失从入队失败转为生存期超时',
        '没有任何变化',
      ],
      answer: 1,
      explain: '更大的缓冲区不能产生空口时间，只会使帧等待得更久。默认设置下，最后一秒的平均等待是 472 ms。',
    },
  ],
}
