/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · the queue, the lifetime on every
 * frame in it, and the drop that happens when it is full.
 *
 * Standard-first shape (① standard → ② this simulator → ③ hands-on), converted
 * on 2026-11-11 after the IEEE Std 802.11-2024 check of what this lesson
 * teaches. The standard says little about a queue: EDCA's reference model has
 * one transmit queue per access category (§10.23.2.1), §10.3.4.5 leaves the
 * choice of the next MSDU after a failure to the implementation, and nothing
 * fixes a queue length or an overflow policy. What it does fix is the
 * lifetime, and it fixes it TWICE: a non-QoS (DCF) station's timer starts at
 * the first transmission attempt (§10.4, dot11MaxTransmitMSDULifetime,
 * default 512 TU); a QoS station's starts when the MSDU is passed to the MAC
 * (§10.23.2.12.1, dot11EDCATableMSDULifetime, default 500 TU) — the standard's
 * own NOTE says so. Every node of this scene is non-QoS, and the engine uses
 * the EDCA rule for all of them, so ② marks that row `differs`: the 188 frames
 * the access point throws out without ever sending them exist only because of
 * it. That is reported as an engine change, not taught as the standard.
 *
 * The scene is `retries-queues`'s, unchanged (`sameSceneAs: 'retries-queues'`),
 * so the recorded timeline hashes of this id are copies of that lesson's. Every
 * figure printed below is read back out of the text and compared with a run in
 * tests/course/queues.test.ts.
 */
import { J, type Lesson } from '../lessonKit'
import { dropOf, retriesScenario } from './retries-queues'

export const queues: Lesson = {
  id: 'queues',
  module: 4,
  title: '队列、生存期与队列溢出丢弃',
  why: '队首的一个 MSDU（MAC service data unit）无法成功发送时，后面的所有帧都在等待，而上层应用并不会因此减少下发的数据。IEEE 802.11-2024 对这条队列（queue）规定得很少：增强型分布式信道接入（enhanced distributed channel access, EDCA）的参考模型给每个接入类别（access category, AC）一条发送队列，一次失败之后先发哪一帧由实现决定，队列多长、满了丢弃哪一帧都没有规定。标准规定的是生存期（MSDU lifetime）：一帧的发送计时器超过上限，重传（retry）即停止、这一帧被丢弃；不支持服务质量（quality of service, QoS）的站点（STA）的计时器从第一次尝试发送时起算，QoS 站点的计时器从这一帧交给媒体访问控制（medium access control, MAC）层时起算。本仿真器把失败的帧放回队首，队列上限取 500 帧，满了就拒绝新到的帧，生存期一律从入队起算、取 500 ms——对本课的非 QoS 站点，这一点与标准不同，所以这里大多数因生存期被丢弃的帧一次也没有发送过。在这些取法之下，把队列调短或把生存期调短，接入点（AP）送达的帧数完全不变：能送出多少由信道决定，而不是由缓冲区决定，这些参数改变的只是在哪个环节放弃。把缓冲区加大，帧也只是等待得更久，送达帧的平均等待时间最后稳定在略低于生存期的水平。',
  outcomes: [
    '说出标准对发送队列与生存期规定了什么、没有规定什么',
    '分清本仿真器的队列哪些照标准、哪些是它自己的取值与取法',
    '从三次运行里读出一帧被放弃的三种原因，并解释为什么送达的帧数不变',
  ],
  needs: ['retries-queues'],
  terms: [
    { term: 'queue', plain: '等待发送的帧序列；本仿真器里最早入队的排在最前面' },
    { term: 'lifetime', plain: '一帧允许用于发送的最长时间；超过之后重传停止，这一帧被丢弃' },
  ],
  standard: [
    { heading: '发送队列（§10.23.2.1，图 10-27）', text: 'EDCA 的参考模型里，QoS 站点按接入类别把帧映射到发送队列，每个接入类别一个 EDCA 功能实体，各自独立竞争信道。标准没有规定队列的长度，也没有规定队列满时丢弃哪一帧。' },
    { heading: '失败之后先发哪一帧（§10.3.4.5，§10.7）', text: '一次发送失败之后，站点接下来尝试发送哪一个尚未完成的 MSDU，由实现决定，标准称这一算法超出本标准的范围；它只须遵守 §10.7 的限制。§10.7 为了避免 MSDU 乱序规定：非 QoS 站点在任何时刻，来自同一源地址、发往同一个接收端、已经开始发送而尚未完成的 MSDU 不得多于一个。发往其他接收端的帧不受这一条限制。' },
    { heading: '非 QoS 站点的生存期（§10.4，§10.3.4.4，附录 C）', text: '源站点为每个正在发送的 MSDU 维护一个发送计时器，从第一次尝试发送这个 MSDU 时开始计时。计时器超过 dot11MaxTransmitMSDULifetime，重传即停止，这个 MSDU 被丢弃。dot11MaxTransmitMSDULifetime 以 TU 为单位，缺省 512 TU；1 TU = 1024 µs。§10.7 建议把这个值取得足够大，使正常工作时不会因计时器超时而丢弃 MSDU。' },
    { heading: 'QoS 站点的生存期（§10.23.2.12.1，附录 C）', text: 'QoS 站点为交给 MAC 的每个 MSDU 维护一个发送计时器，从这个 MSDU 交给 MAC 时开始计时；非 AP 站点的上限是 dot11EDCATableMSDULifetime，AP 的上限是 dot11QAPEDCATableMSDULifetime，都按接入类别设置。前者缺省 500 TU。计时器超过上限，重传即停止，这一帧被丢弃。标准在这里专门注明：分布式协调功能（distributed coordination function, DCF）与 EDCA 的计时器在不同时刻开始。' },
    { kind: 'steps', heading: '一帧离开发送方的几种方式，按标准：逐步说明', items: [
      '上层把 MSDU 交给 MAC；QoS 站点从此刻开始计时（§10.23.2.12.1）。',
      '实现决定先发送哪一帧（§10.3.4.5）；非 QoS 站点从第一次尝试发送时开始计时（§10.4）。',
      '收到确认：这一帧发送成功。',
      '未收到确认：重传，直到 SRC 等于 dot11ShortRetryLimit，这一帧被丢弃（§10.3.4.4）。',
      '计时器超过生存期：重传停止，这一帧被丢弃（§10.4，§10.23.2.12.1）。',
      '队列已满时怎样处理新到的帧，标准没有规定。',
    ] },
  ],
  implementation: [
    { topic: '队列数目', standard: 'QoS 站点每个接入类别一条发送队列（§10.23.2.1）', sim: 'QoS 站点四条；非 QoS 站点一条。本课四台设备都是非 QoS 站点，每台一条队列。', kind: 'faithful' },
    { topic: '队列长度', standard: '标准未规定', sim: '每条队列最多 500 个 MSDU，沿用 ns-3 的 WifiMacQueue。', kind: 'value' },
    { topic: '队列满时', standard: '标准未规定', sim: '拒绝新到的那一帧（ns-3 的 DROP_NEWEST），写一条 queueFull 丢弃记录，不写入队记录。', kind: 'choice' },
    { topic: '失败之后先发哪一帧', standard: '由实现决定（§10.3.4.5）', sim: '失败的帧放回队首，所以下一次发送的仍是它，除非它在此期间被丢弃。发往同一接收端的帧本来就要等它完成（§10.7），这一点与标准一致。', kind: 'choice' },
    { topic: '按接收端分别排队', standard: '标准未规定', sim: '同一接入类别的帧不论发往哪个接收端都在同一条先进先出的队列里，取帧时先看队首那一帧发给谁；一个无法送达的接收端会阻塞发往其他接收端的帧，尽管 §10.7 并不禁止先发送它们。', kind: 'choice' },
    { topic: '生存期从何时起算', standard: '非 QoS 站点从第一次尝试发送时起算（§10.4）；QoS 站点从交给 MAC 时起算（§10.23.2.12.1）', sim: '所有站点一律从入队时起算，即 QoS 站点的规则。本课的站点都是非 QoS 站点，按标准，一次也没有发送过的帧不会因生存期被丢弃；这里却会。', kind: 'differs' },
    { topic: '生存期的取值', standard: 'dot11MaxTransmitMSDULifetime 缺省 512 TU；dot11EDCATableMSDULifetime 缺省 500 TU，即 512 ms（附录 C）', sim: '所有站点、所有接入类别都取 500 ms；场景可以改，本课的变体取 100 ms。', kind: 'value' },
    { topic: '何时检查生存期', standard: '标准只规定超过上限即停止重传、丢弃这一帧，没有规定在何时检查', sim: '每次组帧发送之前，先把这条队列里超过生存期的帧全部丢弃，无论它们是否发送过。', kind: 'choice' },
    { topic: '业务源与主动队列管理', standard: '不在 802.11 的范围之内', sim: '业务源不因丢帧或排队而降速；队列也不做主动队列管理，只有队满拒绝与生存期两种丢弃方式。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '三帧同时因生存期被丢弃',
      jump: 0,
      steps: [
        '载入本课场景，跳到 Hidden B 第一次因生存期丢帧。',
        '读出同一时刻被丢弃的几帧：它们何时入队，各自发送过几次。',
      ],
      expect: '504 465 µs 处 Hidden B 一次丢弃三帧，三帧都是在 0 µs 入队的。排在最前面的那一帧（序列号 17）发送过 5 次，后面两帧一次也没有发送过——它们本身没有任何问题，只是排在一个无法发出的帧后面。',
      meaning: '失败的帧放回队首是本仿真器的取法（②），所以出现队头阻塞。两帧没有发送过却超过生存期，是因为本仿真器从入队起算生存期（②，与标准不同）；按 §10.4，非 QoS 站点的计时器要到第一次尝试发送时才开始。',
    },
    {
      heading: '接入点的队列被填满',
      jump: 1,
      steps: [
        '跳到 AP 第一次因队列满丢帧，再跳到 AP 第一次因生存期丢帧。',
        '对照下表读出 AP 送达的帧在各个时段平均等待了多久。',
      ],
      blocks: [
        { kind: 'table', heading: '送达帧的等待时间', head: ['送达时段', '平均等待，默认'], rows: [
          ['0–0.5 s', '19 ms'],
          ['0.5–1 s', '149 ms'],
          ['1–1.5 s', '228 ms'],
          ['1.5–2 s', '324 ms'],
          ['2–2.5 s', '472 ms'],
          ['2.5–3 s', '472 ms'],
        ] },
      ],
      expect: '视频源三秒内向 AP 下发 3541 个 1400 字节的帧（13.2 Mb/s），送达 2644 帧（9.9 Mb/s）。1 963 852 µs 时队列已有 500 帧，新到的帧第一次被拒绝；2 182 806 µs 处 AP 一次丢弃四帧，已排队 500.2 到 502.6 ms。三秒内 AP 因生存期丢弃 194 帧，其中 188 帧一次也没有发送过，6 帧发送过、失败后又等待到超过生存期。平均等待前两秒持续上升，之后稳定在 472 ms。',
      meaning: '下发速率超过信道的承载能力，队列先排满（队列长度与队满策略都是本仿真器的取值，②），之后等待超过 500 ms 的帧在发送之前就被清除，所以等待时间不再增加。',
    },
    {
      heading: '两个参数，三次运行',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「短队列：100 个 MSDU，生存期 500 ms」与「短生存期：500 个 MSDU，生存期 100 ms」，各运行三秒。',
        '对照下表读出每次运行的三种丢弃与 AP 送达的帧数。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的三秒，三种设置', head: ['运行', '入队失败', 'AP 处过时', '上传帧发满七次', 'AP 送达'], rows: [
          ['默认：500 帧、500 ms', '213', '194', '123', '2644'],
          ['短队列：100 帧', '797', '0', '123', '2644'],
          ['短生存期：100 ms', '0', '770', '40', '2644'],
        ] },
      ],
      expect: '三次运行 AP 送达的都是 2644 帧。队列调短，入队失败从 213 增加到 797，AP 处过时丢弃降为 0；生存期调短，入队失败一次也没有，AP 处过时丢弃增加到 770。短生存期那一次，两台上传站点有 987 帧因生存期被丢弃，默认设置下不到 20 帧；它们发满七次的帧反而从 123 降到 40，因为生存期先一步把帧丢弃了。最后一秒送达帧的平均等待依次是 472 ms、117 ms、88 ms。',
      meaning: '队列只是帧等待的地方，不产生空口时间（airtime）；两个参数改变的是在哪个环节放弃（②的取值与取法）。重传上限（retry limit）与生存期哪一个先到，标准都规定丢弃（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.1 与图 10-27（EDCA 参考模型，每个接入类别的发送队列）、§10.3.4.5（失败之后先发哪一帧超出本标准的范围）、§10.7（MSDU 发送限制，建议生存期取得足够大）、§10.4（非 QoS 站点的发送计时器从第一次尝试起算）、§10.3.4.4（重传上限与生存期）、§10.23.2.12.1（QoS 站点的计时器从交给 MAC 时起算，并注明两者起算时刻不同）、附录 C（dot11MaxTransmitMSDULifetime 缺省 512 TU，dot11EDCATableMSDULifetime 缺省 500 TU）、第 3 章（1 TU = 1024 µs）。',
    '本仿真器的取值与取法：500 个 MSDU 的队列上限与「拒绝新到者」（沿用 ns-3 的 WifiMacQueue），失败帧放回队首，所有站点从入队起算的 500 ms 生存期，发送之前统一清除过期帧，不降速的业务源；随机种子、隐藏节点户型与 13.2 Mb/s 的视频源同样如此。',
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
    J('第一次因生存期丢帧（Hidden B）', dropOf('lifetime', 'sta-2')),
    J('第一次因队列满丢帧（AP）', dropOf('queueFull', 'ap')),
    J('AP 第一次因生存期丢帧', dropOf('lifetime', 'ap')),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: 'AP 的日志中大量出现 queueFull。应作何诊断？',
      options: [
        '到那个客户端的链路（link）在失败',
        '这些帧已经过时',
        '下发的流量超过了信道的承载能力',
      ],
      answer: 2,
      explain: '帧到达的速度超过离开的速度。链路失败表现为 retryLimit，数据过时表现为 lifetime。',
    },
    {
      q: '按标准，一个非 QoS 站点的 MSDU 生存期从何时开始计时？',
      options: [
        '从这一帧交给 MAC 时',
        '从第一次尝试发送这一帧时',
        '从这一帧排到队首时',
      ],
      answer: 1,
      explain: '§10.4：非 QoS 站点从第一次尝试发送时开始计时；从交给 MAC 时开始计时是 QoS 站点的规则（§10.23.2.12.1）。本仿真器对所有站点都用后一种。',
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
