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
      '上传被放弃', 'AP 送达',
    ], rows: [
      ['默认：500 帧、500 ms', '213', '194', '123', '2644'],
      ['短队列：100 帧', '797', '0', '123', '2644'],
      ['短生存期：100 ms', '0', '770', '40', '2644'],
    ] },
    { heading: '旋钮做不到的事', text: '三次运行里 AP 送达的都是同样的 2644 个视频帧：缓冲区变不出空口时间。短队列把损失挪到门口，短生存期把它挪到钟上——两台上传站点（STA）因此有 987 帧老死在队列里。' },
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
