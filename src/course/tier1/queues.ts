/**
 * Wi-Fi Tier 1 · M5 · 听不见的邻居与损失 · the queue, the clock on it, and the
 * door.
 *
 * The second half of `retries-queues`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M5). The
 * parent carried two rules the engine follows — one frame's seven attempts, and
 * what the line behind it does — and this lesson is the second: what a queue
 * holds, the clock every frame in it is under, and the three places a frame can
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
  title: '队列、生存期与门口丢帧',
  why: '一帧在队首推不出去的时候，后面的一切都在等，而上面的应用并不会因此少交东西。这一课看这条队伍：它能排多长，每一帧身上那只钟走多久，以及一帧被放弃的三个地方——队首、钟上、门口。三者各自说明一件完全不同的事。',
  outcomes: [
    '说出一帧被放弃的三种原因，以及每一种告诉了你什么',
    '解释为什么“再发一次”真正的代价，落在它后面那些帧身上',
    '说清为什么把缓冲区改大，一帧也不会多送到',
  ],
  needs: ['retries-queues'],
  terms: [
    { term: 'queue', plain: '等着轮到自己被发出去的那一列帧，最老的排在最前面' },
    { term: 'lifetime', plain: '一帧在队列里最多能等多久；超过了，就不发了，直接扔掉' },
  ],
  picture: [
    { heading: '它身后的队伍', text: '上面的应用不停地交下新的帧，它们排成一列等着轮到自己，这就是队列（queue）。它们要等信道——也要等排在前面那一帧的每一次尝试。队首一帧发不动，后面一百帧都跟着卡住。一次重传（retry）真正的代价，不是它烧掉的那点空口时间（airtime），而是它塞给其余所有帧的那段等待。' },
    { heading: '过时的数据不如没有', text: '所以一帧身上除了尝试计数，还有一只钟，它的上限叫做生存期（MSDU lifetime）——这里是半秒。等得比这还久，媒体访问控制（MAC）就把它扔掉，不再给它上空口的机会。对一个视频帧或一段语音采样来说这完全正确：它本该属于的那一刻已经过去，迟到送达只会白花空口时间。' },
    { kind: 'watch', jump: 0, heading: '看三帧同时老死', text: '载入仿真，跳到 Hidden B 第一次因生存期丢帧：三帧在同一瞬间被扔掉，它们从仿真的第一个瞬间起就在队列里，其中两帧一次空口都没轮上过。' },
    { heading: '当队伍满了', text: '队列还有一个长度上限。队列一满，新到的帧就在门口被挡回去，连入队记录都没有。这是唯一一种与链路（link）无关、只与负载有关的损失：交下来的流量超过了信道能搬走的量，只有减负或腾出更多空口时间才治得了。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一条队列，一步一步', items: [
      '上面交下来的一帧先看队里还有没有位置：已经有 500 帧在等，它就在门口被挡回去，连队都没进，所以永远不会有入队记录。否则它排到队尾，深度加一。',
      '每次要组一帧发出去之前，MAC 先清一遍这条队列：凡是入队至今超过生存期（这里 500 ms）的，统统扔掉——不管它已经试过几次。接入点（access point, AP）扔掉的 194 帧里，有 188 帧连一次空口都没轮上过，另外 6 帧是试过、失败、又等到老的。',
      '清完之后才从队首取帧，而队首那一帧永远取得到：这是一条严格先进先出的队伍，它推不出去，后面谁也轮不上。',
      '一次尝试失败，这些帧原样放回队首——不是队尾。重传永远插在新帧前面，这也是队尾越积越长的原因。',
      '于是一帧离开队列只有四种方式：被确认；走完七次尝试被放弃；被那只钟清掉；压根没进门。第一种让队伍变短，后三种是三种不同的病。',
    ] },
    { kind: 'table', heading: '一帧被放弃的三种原因', head: [
      '日志里写的', '什么时候触发', '它的含义',
    ], rows: [
      ['retryLimit', '同一帧的第七次尝试失败了', '链路在失败——要修的是链路'],
      ['lifetime', '它在队列里等了超过 500 ms', '数据已经过时，丢掉它是对的'],
      ['queueFull', '新帧到达时已有 500 帧在等', '过载——要么减负，要么扩容'],
    ] },
    { kind: 'table', heading: '同样的三秒，三种设置', head: [
      '运行', '门口挡回', 'AP 处过时',
      '上传试满七次', 'AP 送达',
    ], rows: [
      ['默认：500 帧、500 ms', '213', '194', '123', '2644'],
      ['短队列：100 帧', '797', '0', '123', '2644'],
      ['短生存期：100 ms', '0', '770', '40', '2644'],
    ] },
    { heading: '旋钮做不到的事', text: '三次运行里 AP 送达的都是同一个数：2644 帧。队列调短是这个数，生存期调短也是这个数。原因很直白：队列只是帧排队等待的地方，它不产生空口时间。能送出去多少是信道定的，不是缓冲区定的。' },
    { heading: '旋钮能改的是「在哪里放弃」', text: '把队列调短，帧就在门口被挡回去：门口挡回从 213 涨到 797，而 AP 那边等到过时的从 194 变成 0——被挡在门外的帧进不了队列，也就没机会在里面等到过时。把生存期调短，刚好反过来：门口一个都不挡了，改由那只钟来扔，AP 处过时从 194 涨到 770。同样的三秒、同样的 2644 帧，只是损失换了个地方发生。' },
    { heading: '还有一个表里看不到的连带后果', text: '短生存期那一次，两台上传站点（STA）有 987 帧被钟扔掉，默认设置下这个数不到 20。而同一次运行里，它们「试满七次」的帧反而从 123 降到 40：钟先一步把帧扔了，它们来不及烧完七次尝试。所以上表那一列数的是「试满七次」，和这 987 帧不是同一种放弃——换一个旋钮，有时会连带改掉另一种损失的数目。' },
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
    { heading: '这张表为什么会停住', text: '前两秒等待一路往上涨，之后卡在 472 ms 不动：到这时候，比 500 ms 更老的帧根本不会被发出去。' },
  ],
  deeper: [
    { heading: '队头阻塞', text: '那三帧从仿真的第一个瞬间起就在队列里。排在最前面那一帧（序列号 17）自己烧掉了五次尝试，而后面两帧一次都没轮上——它们本身没有任何问题，只是排在一个推不动的前辈后面。三个人最后都是被年龄上限找到的，不是被信道。这就是本场景里最干净的一幅队头阻塞图景。' },
  ],
  limits: [
    { kind: 'model-value', text: '500 帧的队列上限、500 ms 的生存期与「队满时挡回新到的那一帧」都是引擎的取值，沿用 ns-3 的 WifiMacQueue（queues.ts 的 DEFAULT_QUEUE_LIMIT 与 DEFAULT_MSDU_LIFETIME_NS）。标准只规定 dot11EDCATableMSDULifetime 这个变量存在，既不规定队列多长，也不规定队满时丢哪一头。真实设备常常丢的是队尾最老的一批，或者干脆不丢，而是让上层自己降速。' },
    { kind: 'unmodelled', text: '一个接入类别只有一条队列，而且这条队列对所有接收端是同一条先进先出的队伍：取帧时永远先看队首那一帧发给谁（AcQueues.claim）。于是一个推不动的对端会把同一类里发往其他对端的帧全堵住。真实驱动按「接收端 + 业务类型」分别排队，可以跳过卡住的那一个先服务别人，所以本课那幅队头阻塞的图景比真实设备里的严重。' },
    { kind: 'unmodelled', text: '队列里没有任何主动队列管理：不按排队时延提前丢包，也不做流级公平排队，只有「满了挡在门口」与「太老了清掉」两把钝刀。真实家用路由器上的 CoDel 与 FQ-CoDel 正是为那张 472 ms 的等待表而存在的：它们在队伍还没排满时就开始丢包，把时延压回几十毫秒。' },
    { kind: 'out-of-scope', text: '业务源没有任何反馈回路：饱和上传在每次出队时立刻补上一帧（traffic.ts 的 refill），视频按自己的时钟每 747 µs 加 0–200 µs 抖动产生一个 1400 字节的帧，不管队列里已经堆了什么。真实的 TCP 会因为丢包与时延自己降速。所以「把缓冲区改大，一帧也不会多送到」这条结论在本模型里是绝对的，在真实网络里只是大致成立。' },
  ],
  sources: [
    'MSDU 生存期即 IEEE Std 802.11-2024 的 dot11EDCATableMSDULifetime；每个接入类别一条传输队列见 §10.23.2。标准并不规定队列多长，也不规定队满时丢哪一头。',
    '500 个 MSDU 的队列上限、500 ms 的生存期与“丢弃新到者”（ns-3 的 DROP_NEWEST）都是本仿真器的模型取值，沿用 ns-3 的 WifiMacQueue；随机种子、隐藏节点户型与 13.2 Mb/s 的视频源同样如此。',
    '“发送之前先清过期帧”是 src/engine/mac.ts 里 transmitFor 的第一步，所以一帧可以在从没上过空口的情况下过期——上面的 188 帧就是这么来的。',
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
    '选中 AP 并播放。队列计数涨了两秒，队首帧的年龄逼近 500 ms；1 963 852 µs 第一次队列满丢帧后，两种损失交替出现。',
    '2 182 806 µs 处 AP 一次丢掉四帧，年龄在 500.2 到 502.6 ms 之间——生存期是逐帧算的。',
  ],
  tryThis: [
    '依次载入两个变体，去找 AP 第一次队列满丢帧与第一次生存期丢帧。先预测每个变体缺哪一种，以及为什么三次运行送达的都是 2644 帧。',
  ],
  quiz: [
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
