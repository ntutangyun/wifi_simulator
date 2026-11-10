/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · A-MPDU, paying the ceremony once.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md) and grown
 * from the 240-word original: what a batch under one preamble looks like, the
 * one answer that covers all of it, and what happens to a bad member of the
 * batch. The ceiling and the simulator's own bluntness live in `deeper`; the
 * clause numbers in `sources`.
 *
 * **Stays whole** in the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8 and
 * §7.2): the BlockAck half would own one jump and one observe line, which is the
 * bad split the user warned about. What it loses instead:
 *  - the ADDBA aside 「必须先存在的那份约定」(§5.5) — a handshake this simulator
 *    assumes and never puts on the timeline;
 *  - the `deeper` note 「成员之间的那段标记」, whose delimiter-and-padding walk the
 *    new fields figure now shows (§4);
 *  - 「它没有改变的东西」(§5.3-class): "the coding did not change" was made three
 *    times — that paragraph, the measured-versus-worked note and the first quiz
 *    explanation. It is made twice now, once as a clause and once as an answer;
 *  - the third observe line, which restated the table's own right-hand column.
 *
 * Step 6 of the procedure is the engine's real rule, read out of
 * `failMsdus`/`bumpQsrc` in src/engine/mac.ts: this engine decodes an aggregate
 * as ONE unit — there is no per-subframe bitmap — so a timeout counts a retry on
 * every subframe of the attempt, sends them back to the queue head and doubles
 * the window. It is a paragraph of the lesson, not a parenthesis.
 *
 * The scenario builder and the variant are unchanged, so the recorded timeline
 * hashes stay identical. Every number quoted below is pinned in
 * tests/course/ampdu.test.ts.
 */
import type { FieldsSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstBa, firstAmpdu, J } from '../lessonKit'

/**
 * One subframe of this run's first batch, to scale: the engine's own
 * `ampduSubframeBytes(1500)` broken into the four parts it sums and the padding
 * it rounds up with. 4 + 26 + 1500 + 4 = 1534, padded to 1536, which is why the
 * batch is 21 502 bytes and not 14 × 1 530 — the sentence this figure replaces.
 *
 * The payload is 97.7 % of the row, so four of the five labels are drawn on
 * callout rows above it. That IS the figure's point: the fixed part of a
 * subframe is 36 bytes against 1 500 of payload, which is why aggregation pays.
 */
export function ampduSubframeFields(): FieldsSpec {
  return {
    kind: 'fields',
    fields: [
      { label: '定界符', size: 4 },
      { label: '帧头', size: 26 },
      { label: '载荷', size: 1500 },
      { label: '校验', size: 4 },
      { label: '填充', size: 2 },
    ],
    unit: 'B',
    total: '一个子帧 1 536 B；十四个首尾相接是 21 502 B',
  }
}

export const ampdu: Lesson = {
  id: 'ampdu',
  module: 7,
  title: 'A-MPDU——竞争一次，发一批',
  why: '取得一次信道的开销很大，而这部分开销与随后发送多少数据毫无关系。等待、倒数、前导码（preamble）与帧头（MAC header）、末尾那个应答，无论这一帧几乎不含数据还是数据已经装满，开销都一样。随着电台速率越来越高，数据所占的时间相对于这部分固定开销越来越短，最终一轮里大半时间都消耗在固定开销上。办法是让站点（STA）把队列（queue）里发往同一个接收端的帧首尾相接，在同一个前导码之后一次发出，这一批叫聚合 MPDU（aggregate MPDU, A-MPDU）。帧并没有被合并：每一帧仍带有自己的帧头和校验，接收端整批只回一个块确认（block acknowledgement, BlockAck），用一张位图（bitmap）逐帧报告是否收到。一批容纳多少帧，取决于两条限制中先达到哪一条：结构上最多六十四帧，时间上整次交互必须在这一轮允许占用信道的时长之内完成；本场景先达到的是时间限制，一批十几帧。同样的编码、距离和字节，每成功一帧的空口时间（airtime）减少了四分之一以上，整轮送达的帧数约为不聚合时的一倍半；两边赢下的轮数几乎相同，所以这份收益全部来自固定开销分摊到了更多帧上，与速率无关。按标准，一批里有一帧出错只重发那一帧；本仿真器把整批当作一个整体判定，任何一处失败都要整批重发。',
  outcomes: [
    '解释为什么电台速率越高，一轮的固定开销所占的比例反而越大',
    '说明一个前导码之后的那一批包含什么，以及接收端如何对它应答',
    '读出一帧成功送达要占用多少空口时间（airtime）——聚合与不聚合时各是多少',
  ],
  // §6 of the re-pacing plan moves this row to the halves that now own the material:
  // `small-frames` owns "many frames share one preamble" and `frame-qos-fcs` the QoS
  // header and the per-frame check a subframe keeps.
  needs: ['small-frames', 'frame-qos-fcs', 'retries-queues'],
  terms: [
    { term: 'A-MPDU', plain: '一批帧首尾相接组成一个整体，在同一个前导码之后作为一次传输发出' },
    { term: 'subframe', plain: '这一批里的其中一帧：它保留自己的帧头和自己的校验，也单独判定是否正确接收' },
    { term: 'BlockAck', plain: '块确认：一个简短的应答就覆盖整批，其中为这一批的每一个成员保留一位' },
  ],
  picture: [
    { heading: '固定开销与发送的数据量无关', text: '把空口上的一轮分成两部分：固定的开销，和随数据量变化的那一段。静默、倒数、供接收端同步的那段前导码、末尾那个应答，都是固定的那部分；只有载荷（payload）随发送的数据变长。换一档更快的编码，载荷那一段会缩短——但固定的那部分完全不变，因为前导码是以所有设备都能接收的低速率发送的，而那段等待不管随后用多高的速率发送，长度都一样。' },
    { heading: '好几帧，一个前导码', text: '所以，与其把一整轮用于一帧，发送方把已经在队列（queue）中、发往同一个接收端的帧全部取出，首尾相接排好，作为一次传输、在同一个前导码之后发出。这一批就是聚合 MPDU（aggregate MPDU, A-MPDU）。其中的帧并没有被合并：每一帧都保留自己的帧头和自己的校验；这一批里的一个成员，就是一个子帧（subframe）；每个子帧之前还有一小段定界符（MPDU delimiter）指明它的长度，之后再补几个字节的填充（padding），使下一个成员从对齐的边界开始。' },
    { kind: 'watch', jump: 0, heading: '打开一批看看', text: '载入仿真，跳到第一批。它带着一个角标，上面是这一批里帧的数量；把鼠标悬停在上面，看看这个数量和总字节数，再看看这一轮里用于其他操作的时间有多少。' },
    { heading: '一个应答覆盖整批', text: '如果逐个单独应答，刚节省下来的开销又会重新出现：每个成员都需要一段间隔加一个短帧。于是接收端改为整批只回一个应答，这个应答就是块确认（block acknowledgement, BlockAck）。它只比一个普通确认帧（acknowledgement, ACK）稍长，却带有一张位图（bitmap），每个成员占一位，表示收到或未收到。一次间隔，一个应答，整批的确认就完成了。' },
    { heading: '当其中一帧出错时', text: '正因为每个成员都是单独校验的，一帧出错并不影响其余帧。它在位图里的那一位保持为空，只有这一帧重新排队——它甚至可以被编入下一批，和新到的帧一起发送。这一点恰恰是本仿真器没有建模的：在这里，一批里任何位置发生碰撞，整批都会丢失，所以繁忙房间看起来会比真实情况更差一些。下面第 6 步写的就是它真正做的事。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一次传输，两种方式', head: [
      '一次传输之内', '聚合', '不聚合',
    ], rows: [
      ['发出的帧数', '14', '1'],
      ['这次传输', '21 502 B · 2 248 µs', '1 530 B · 200 µs'],
      ['应答', 'BlockAck · 32 B · 32 µs', 'ACK · 14 B · 28 µs'],
      ['起始交互', 'RTS + CTS · 28 µs each', '—'],
      ['每成功一帧的发送时间', '166.9 µs', '228.0 µs'],
    ] },
    { kind: 'formula', heading: '最后一行如何计算', text: '聚合：   (28 + 28 + 2 248 + 32) µs ÷ 14 帧 = 166.9 µs\n逐帧发送：(200 + 28) µs ÷ 1 帧      = 228.0 µs', note: '同样的编码，同样的字节，同一个房间。节省下来的全部来自“不必再发送的那些部分”。' },
    { kind: 'table', heading: '整轮仿真，两种方式', head: [
      '200 ms 之内', '聚合', '不聚合',
    ], rows: [
      ['赢下的轮数（TXOP）', '81', '83'],
      ['每轮发送的帧数', '13.8', '8.9'],
      ['每轮的发送次数', '2（请求与应答 + 一批）', '8.9'],
      ['成功送达的帧数', '1 120', '738'],
      ['每成功一帧的发送时间', '168.9 µs', '228.3 µs'],
    ] },
    { heading: '两种方式都是「赢得一轮，连续发送多帧」', text: '上面那两行是这张表最容易被算错的地方，所以单独说明：不聚合并不是「一轮只发一帧」。赢得一个传输机会（TXOP）之后，不聚合的站点同样连续发送八九帧，只是每一帧都带有自己的前导码（preamble）、自己的确认帧，中间还隔着一段固定的间隔。用 83 轮去除 738 帧会得到 8.9，而不是 1——那个 1 属于上面「一次传输之内」那张表，说的是一次传输包含几帧。所以聚合节省的不是「一轮多发几帧」，而是把八九个前导码和八九个确认帧换成一个前导码和一个确认帧。' },
    { heading: '为什么实测和算式不完全一致', text: '两种打法赢下的轮数几乎一样多——差别在于每一轮的帧共用多少固定开销。实测值比算式稍高一点，原因很简单：200 ms 结束时最后一轮才刚刚开始，它的请求、应答和那一批都计入了分子，但它的十四帧还没有送达。整个运行中没有任何重传（retry）——80 轮全部成功。两边的编码、距离和字节完全相同，所以这份收益里没有任何一部分来自速率：变的只有固定开销与数据的比例。' },
    {
      kind: 'diagram', heading: '一批里的一个子帧',
      spec: ampduSubframeFields(),
      caption: '本轮第一批里的一个子帧：固定的那 34 字节（定界符、帧头、校验）加上 1 500 字节载荷，再补齐到 1 536。十四个这样的子帧首尾相接就是 21 502 字节——不是 14 × 1 530，差额正是这些定界符与填充。',
    },
    { kind: 'steps', heading: '一批如何组成，又如何得到应答', items: [
      '电台先取队列最前面那一帧，确定它的接收端。能够一起发送的，必须是发往同一个接收端的帧，而且按队列中的先后顺序选取。',
      '它逐帧加入，最多 64 帧；一旦下一帧会使这次传输比 5.484 ms 还长，或者使整次交互——这一批、那段间隔、那个应答——超出本轮的结束时刻，就停在这一帧之前。队头那一帧总是可以发送，如果无法再容纳其他帧，就只发送它一帧。',
      '然后把选中的帧首尾相接排好，每一帧都成为一个子帧：上图那五段，先是 4 字节的定界符（MPDU delimiter），里面写着长度，接着是这一帧自己的服务质量（quality of service, QoS）帧头、它的载荷和它的校验，最后补齐到四字节边界。最后一个子帧不补齐，所以它是 1 534 字节。',
      '全部子帧作为一次传输发出：一个前导码，一种编码。',
      '一个短帧间间隔（short interframe space, SIFS）之后，接收端只回一个 32 字节的 BlockAck；按标准，它为每一个子帧携带一位——收到的置位，未收到的不置位。',
      '本仿真器的处理较为简化：它把这一批当成一个整体判定，不生成逐子帧的位图。一次尝试只要失败——这一批没有收到 BlockAck，或者起始的请求没有收到应答——这次尝试里的每一帧都记一次重传（retry），一起回到队列最前面等待编入下一批，窗口也像发生一次碰撞那样翻倍。本场景只有一台上传站点，没有其他站点与它竞争，所以整轮 200 ms 里一次失败都没有发生。',
    ] },
    { kind: 'table', heading: '第一批，逐项累加', head: [
      '步骤', '数值',
    ], rows: [
      ['取出的帧数，允许的是 64', '14'],
      ['前十三个每个：4 + 26 + 1 500 + 4，再补齐', '1 536 B'],
      ['最后一个，不补齐', '1 534 B'],
      ['13 × 1 536 + 1 534', '21 502 B'],
      ['空口时长', '2 248 µs'],
      ['整次交互：请求、应答、三段间隔、这一批、BlockAck', '2 384 µs'],
      ['本轮的上限', '2 528 µs'],
      ['剩余时间，而第十五个子帧约需 160 µs', '144 µs'],
    ] },
  ],
  deeper: [
    { heading: '一批的大小由什么决定', text: '两个上限同时存在，以较低的那个为准。一个是结构上的：这里一个聚合最多容纳 64 个成员，总长度还受接收端同意缓存的数据量约束。另一个是时间：这一批、它的起始交互和它的应答，必须全部在获胜者被允许占用信道的那段时间内完成。本场景中先达到的是时间上限，所以这一批是 14 帧，而不是 64 帧。' },
    { heading: '定界符还有一个用处', text: '每段定界符里除了长度，还带着对这个长度的校验。正是这一点，使漏掉某个成员开头的接收端可以按照长度直接跳到下一个成员，而不是丢弃这一批剩余的全部内容。本仿真器不建模这种“跳过并继续解码”，所以它比真实接收机更容易整批放弃。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '引擎把一个聚合当成一个整体判定：这里的 BlockAck 没有逐子帧的位图，收到就是整批成功，没收到就是整批失败——这次尝试里的十四帧一起记重传、一起回到队首（mac.ts 的 failMsdus，以及应答分支里那句「没有可供部分失败的位图」）。所以读完本课不要以为自己看到了部分重传：真实设备只重发位图中未置位的那几帧，繁忙房间里的表现比这里好得多。上面「当其中一帧出错时」讲的是标准，不是这个仿真器。' },
    { kind: 'unmodelled', text: '每个子帧前面那 4 字节定界符在这里只是字节数，引擎不用它做任何事。真实接收机靠定界符里的长度与它自己的校验，在漏掉某个成员的开头之后跳到下一个成员继续解码。引擎不建模这种「跳过并继续解码」，所以它比真实接收机更容易整批放弃。' },
    { kind: 'unmodelled', text: '这一批发出之前必须先完成的协商——ADDBA 握手、双方商定的重排序窗口与缓存大小——引擎直接假设它存在，时间轴上永远看不到，帧类型里也没有任何管理帧。于是 64 这个上限只受引擎的常数约束（phy.ts 的 MAX_AMPDU_MPDUS），而真实设备受对端同意缓存的数据量约束，常常远小于 64。' },
    { kind: 'model-value', text: '一批的字节数按「4 字节定界符 + 26 字节 QoS 帧头 + 载荷 + 4 字节校验，再补齐到四字节边界」算（frames.ts 的 ampduPsduBytes），引擎不做 A-MSDU——把多个上层包封装在同一个 MAC 帧头之下的那一层聚合。所以这里每 1500 字节载荷都要自带 36 字节的非载荷字节（含补齐）。真实设备常常两层聚合一起用，同样的空口时间可以承载更多数据。' },
    { kind: 'out-of-scope', text: '本场景只有一台上传站点，整轮 200 ms 里一次失败也没有，所以「整批丢失」这条最粗糙的简化在这里完全看不出代价。要看到它，房间里必须有其他站点与它竞争；而那时本课的收益数字——1120 对 738 帧——就不再成立。' },
  ],
  sources: [
    'A-MPDU 聚合、定界符、补齐到四字节边界，以及这里用的 64 个子帧上限，见 IEEE Std 802.11-2024 的 §10.12 与 §9.7；BlockAck 帧及其位图见 §9.3.1.9，先于它的那份约定见 §10.25。',
    '“聚合中任意一处发生碰撞就整批丢失”是本仿真器的模型取值：标准是按每个子帧各自的比特来确认的。随机种子、这台唯一的上传站点、1500 字节的帧，以及本轮最终采用的编码，同样都是模型取值。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated'),
  ]),
  variants: [
    {
      label: '关闭聚合（同一设备）',
      scenario: () => sc(oneRoom(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated', { edca: true, txop: true }),
      ]),
    },
  ],
  jumps: [
    J('第一个 A-MPDU', firstAmpdu),
    J('第一个 BlockAck', firstBa),
  ],
  observe: [
    '这里的每一批都带着 ×14 的角标。悬停其中一个：十四帧、21 502 字节在同一个前导码之后发出，是一次时长 2 248 µs 的传输。',
    '一个淡紫色的 BlockAck，32 字节、32 µs，就结束了这一轮——它取代的是十四个独立应答，以及每个应答之前的那段间隔。',
  ],
  tryThis: [
    '在检视器里观察：每赢得一次信道，队列就清掉 14 帧，而不是 1 帧。14 是“一次获胜允许持续的时间”能够容纳的数量，并不是聚合的上限——上限是 64 帧。',
    '比较两个变体的吞吐量。同样的编码、同样的距离，这里成功送达的帧数约为 1.5 倍；这个差距只反映聚合本身的贡献，因为两个变体赢下一轮的频率差不多。',
  ],
  quiz: [
    {
      q: '这份收益主要来自哪里？',
      options: [
        '聚合之后使用了更高的编码速率',
        '把一轮的固定开销分摊到许多帧上，而不是只由一帧承担',
        '批里的帧头更短了',
      ],
      answer: 1,
      explain: '对比的两边编码完全相同。变的只是固定开销与数据的比例。',
    },
    {
      q: '一批里有一帧校验未通过。按标准会如何处理？',
      options: [
        '整批重发',
        '它在应答里的那一位保持为空，只有这一帧重新排队',
        '接收端另发一条请求，专门要求重发这一帧',
      ],
      answer: 1,
      explain: '每个成员都是单独校验的，所以应答可以精确到每一帧。本仿真器的处理较为简化，会丢弃整批。',
    },
  ],
}
