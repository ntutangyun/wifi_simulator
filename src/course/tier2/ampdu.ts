/**
 * Wi-Fi Tier 2 · M3 · QoS and efficiency · A-MPDU, paying the ceremony once.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md) and grown
 * from the 240-word original: what a batch under one preamble looks like, the
 * one answer that covers all of it, and what happens to a bad member of the
 * batch. The ceiling, the delimiters and the simulator's own bluntness live in
 * `deeper`; the clause numbers in `sources`.
 *
 * The scenario builder and the variant are unchanged, so the recorded timeline
 * hashes stay identical. Every number quoted below is pinned in
 * tests/course/ampdu.test.ts.
 */
import { type Lesson, N, oneRoom, node, sc, firstBa, firstAmpdu, J } from '../lessonKit'

export const ampdu: Lesson = {
  id: 'ampdu',
  module: 2,
  title: { en: 'A-MPDU — pay contention once', zh: 'A-MPDU——竞争一次，发一批' },
  why: {
    en: 'Winning the channel is expensive, and the price has nothing to do with how much you then send. The waiting, the countdown, the pattern at the head of the frame and the answer at the end all cost the same whether the frame is nearly empty or as full as it can be. As radios got faster the data shrank against that fixed price, until most of a turn was ceremony. This lesson watches a station (STA) buy one turn and use it properly.',
    zh: '赢下信道是件贵事，而这笔钱和你随后发多少毫无关系。等待、倒数、帧头那段图案、末尾那个回答，无论这一帧几乎是空的还是塞得满满当当，价钱都一样。随着电台越来越快，数据在这笔固定开销面前越缩越小，最后一轮里大半时间都花在了排场上。这一课我们看一台站点（STA）如何买下一轮，并且把它用好。',
  },
  outcomes: [
    { en: 'explain why a faster radio makes the fixed cost of a turn worse, not better', zh: '解释为什么电台越快，一轮的固定开销反而越难受' },
    { en: 'describe what one batch under one preamble contains, and how it is answered', zh: '说清一个前导下面那一批里装着什么，以及它是怎么被回答的' },
    { en: 'read the airtime a delivered frame costs, with the batch and without it', zh: '读出一帧成功送达要花多少空口时间——打批和不打批各是多少' },
  ],
  needs: ['airtime', 'frame-anatomy', 'retries-queues'],
  terms: [
    { term: 'A-MPDU', plain: {
      en: 'a batch of frames packed one after another and sent as a single transmission, under one preamble',
      zh: '一批帧首尾相接打成一包，在同一个前导下面作为一次传输发出去',
    } },
    { term: 'subframe', plain: {
      en: 'one of the frames inside the batch: it keeps its own header and its own check, and is judged on its own',
      zh: '这一批里的其中一帧：它保留自己的帧头和自己的校验，也单独接受判决',
    } },
    { term: 'BlockAck', plain: {
      en: 'block acknowledgement: one short answer covering the whole batch, carrying a bit for each member of it',
      zh: '块确认：一个简短的回答就覆盖整批，里面为这一批的每一个成员留了一位',
    } },
  ],
  picture: [
    { heading: { en: 'The ceremony costs the same either way', zh: '排场的价钱两边一样' }, text: {
      en: 'Think of one turn on the air as a fixed price plus a variable one. The silence, the countdown, the preamble the receiver locks onto and the answer at the end are the fixed part; only the payload grows with what you send. Choose a faster coding and the payload shrinks — but the fixed part does not move, because a preamble is sent at the slow rate everyone can hear, and the waiting costs the same however fast you then talk.',
      zh: '把空口上的一轮想成“固定价 + 浮动价”。静默、倒数、让接收端锁住的那段前导、末尾那个回答，都是固定的那部分；只有净荷随你发的东西变大。换一档更快的编码，净荷会缩——可固定的那部分纹丝不动，因为前导是用人人都听得见的慢速率发的，而那段等待不管你随后说得多快，价钱都一样。',
    } },
    { heading: { en: 'Several frames, one preamble', zh: '好几帧，一个前导' }, text: {
      en: 'So instead of spending a whole turn on one frame, the sender takes everything already queued for the same receiver, lines the frames up back to back, and sends the lot as a single transmission behind a single preamble. That batch is an A-MPDU. Nothing inside it is merged: each frame keeps its own header and its own check. One member of the batch is a subframe, and in front of each one goes a short marker giving its length.',
      zh: '所以，与其把一整轮花在一帧上，发送方干脆把已经排在队列里、发往同一个接收端的帧全拿过来，首尾相接排好，作为一次传输、跟在同一个前导后面发出去。这一批就是 A-MPDU。里面的东西并没有被合并：每一帧都保留自己的帧头和自己的校验；这一批里的一个成员，就是一个子帧，而每个子帧身前还有一小段标记报出它有多长。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Open one batch', zh: '打开一批看看' }, text: {
      en: 'Load the simulation and jump to the first batch. It carries a badge with the number of frames in it; hover it to see that count and the total bytes, then look at how little of the turn is spent on anything else.',
      zh: '载入仿真，跳到第一批。它带着一个角标，上面是这一批里帧的数量；把鼠标悬上去，看看这个数量和总字节数，再看看这一轮里花在其他事情上的时间有多少。',
    } },
    { heading: { en: 'One answer for all of them', zh: '一个回答管住全部' }, text: {
      en: 'Answering each member separately would rebuild the cost we just avoided: a pause and a tiny frame per member. So the receiver sends one answer for the lot instead, and that answer is the BlockAck. It is barely longer than a single acknowledgement, and it carries a map with one bit per member: this one arrived, that one did not. One pause, one answer, the whole batch settled.',
      zh: '如果一个个单独回答，刚省下来的开销就又长回来了：每个成员都要一段停顿加一个小帧。于是接收端改成整批只回一个回答，而这个回答就是 BlockAck。它比一个普通确认帧长不了多少，却带着一张位图，每个成员占一位：这个到了，那个没到。一次停顿，一个回答，整批就结清了。',
    } },
    { heading: { en: 'When one of them is bad', zh: '当其中一个坏了' }, text: {
      en: 'Because every member was checked on its own, a bad one does not condemn the rest. Its bit in the map stays clear, and only that frame is queued again — it can even ride in the next batch alongside fresh ones. This is the part this simulator does not model: here a collision anywhere in a batch loses all of it, which makes a busy room look harsher than a real one.',
      zh: '正因为每个成员都是单独校验的，坏掉一个并不连累其余。它在位图里的那一位保持为空，只有这一帧重新排队——它甚至可以搭上下一批，和新来的帧一起走。这一点恰恰是本仿真器没有建模的：在这里，一批里任何位置发生碰撞，整批都会丢，所以繁忙房间看起来会比真实情况更难堪一些。',
    } },
    { heading: { en: 'What it does not change', zh: '它没有改变的东西' }, text: {
      en: 'Nothing here is sent faster. The coding is the same, the distance is the same, the bytes are the same bytes. All that changed is the ratio between what the room pays for a turn and what the turn delivers — which is why aggregation is the cheapest large gain in modern Wi-Fi, and why every device does it without being asked.',
      zh: '这里没有任何东西被发得更快。编码没变，距离没变，字节还是那些字节。变的只有一个比例：房间为一轮付出的代价，和这一轮真正送到的东西之间的比例——这也是为什么聚合是现代 Wi-Fi 里最便宜的一笔大收益，为什么每台设备都不用谁吩咐就这么做。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'One turn, both ways', zh: '同一轮，两种打法' }, head: [
      { en: 'In one turn', zh: '一轮之内' }, { en: 'Batched', zh: '打批' }, { en: 'One at a time', zh: '一帧一发' },
    ], rows: [
      [{ en: 'Frames sent', zh: '发出的帧数' }, N('14'), N('1')],
      [{ en: 'The transmission', zh: '这次传输' }, N('21 502 B · 2 248 µs'), N('1 530 B · 200 µs')],
      [{ en: 'The answer', zh: '回答' }, N('BlockAck · 32 B · 32 µs'), N('ACK · 14 B · 28 µs')],
      [{ en: 'Opened by', zh: '开场交互' }, N('RTS + CTS · 28 µs each'), N('—')],
      [{ en: 'Transmission time per delivered frame', zh: '每成功一帧的发送时间' }, N('166.9 µs'), N('228.0 µs')],
    ] },
    { kind: 'formula', heading: { en: 'That last row, worked out', zh: '最后一行是怎么算的' }, text: {
      en: 'batched:      (28 + 28 + 2 248 + 32) µs ÷ 14 frames = 166.9 µs\none at a time: (200 + 28) µs ÷ 1 frame        = 228.0 µs',
      zh: '打批：   (28 + 28 + 2 248 + 32) µs ÷ 14 帧 = 166.9 µs\n一帧一发：(200 + 28) µs ÷ 1 帧      = 228.0 µs',
    }, note: {
      en: 'Same coding, same bytes, same room. The saving is entirely in what is no longer sent.',
      zh: '同样的编码，同样的字节，同一个房间。省下来的，全都在“不用再发的那些东西”上。',
    } },
    { kind: 'table', heading: { en: 'The whole run, both ways', zh: '整轮仿真，两种打法' }, head: [
      { en: 'Over 200 ms', zh: '200 ms 之内' }, { en: 'Batched', zh: '打批' }, { en: 'One at a time', zh: '一帧一发' },
    ], rows: [
      [{ en: 'Turns won', zh: '赢下的轮数' }, N('81'), N('83')],
      [{ en: 'Frames delivered', zh: '成功送达的帧数' }, N('1 120'), N('738')],
      [{ en: 'Transmission time per delivered frame', zh: '每成功一帧的发送时间' }, N('168.9 µs'), N('228.3 µs')],
    ] },
    { heading: { en: 'Why the run is not quite the arithmetic', zh: '为什么实测和算式不完全一致' }, text: {
      en: 'Almost the same number of turns is won either way — the difference is what each turn carries. The measured figures sit a little above the worked ones because a few turns are lost and repeated, and the coding is the same on both sides, so none of the gain is hiding in the rate.',
      zh: '两种打法赢下的轮数几乎一样多——差别在于每一轮装了多少。实测值比算式稍高一点，是因为有少数几轮丢了要重来；两边的编码完全相同，所以这份收益里没有一丁点藏在速率上。',
    } },
    { kind: 'steps', heading: { en: 'How a batch is built and answered', zh: '一批是怎么攒起来、又怎么被回答的' }, items: [
      { en: 'The radio takes the frame at the head of the queue and looks at who it is for. Everything that joins it has to be going to that same receiver, and is taken in queue order.',
        zh: '电台先拿队列最前面那一帧，看它是发给谁的。能跟着一起走的，必须是发往同一个接收端的帧，而且按队列里的先后顺序取。' },
      { en: 'It adds them one at a time, at most 64, and stops before the first frame that would make the transmission longer than 5.484 ms or push the whole exchange — the batch, the pause and the answer — past the end of the turn. The head frame always goes, alone if nothing else fits.',
        zh: '它一帧一帧往里加，最多 64 帧；一旦下一帧会把这次传输拉得比 5.484 ms 还长，或者把整次交互——这一批、那段停顿、那个回答——顶到本轮末尾之外，就停在这一帧之前。队头那一帧总是能走，实在装不下别的就它一个走。' },
      { en: 'It lays the chosen frames out end to end. Each becomes a subframe: a 4-byte delimiter carrying the length, then that frame’s own QoS header, its payload and its check, padded up to a four-byte boundary. The last subframe is not padded.',
        zh: '然后把选中的帧首尾相接排好。每一帧都成为一个子帧：先是 4 字节的定界符，里面写着长度，接着是这一帧自己的 QoS 帧头、它的净荷和它的校验，最后补齐到四字节边界。最后一个子帧不补齐。' },
      { en: 'The whole string of subframes goes out as one transmission, behind one preamble, at one coding.',
        zh: '整串子帧作为一次传输发出去：一个前导，一种编码。' },
      { en: 'One SIFS later the receiver answers with a single BlockAck of 32 bytes, which in the standard carries one bit for each subframe — set for the ones that arrived, clear for the ones that did not.',
        zh: '一个 SIFS 之后，接收端只回一个 32 字节的 BlockAck；按标准，它为每一个子帧带一位——到了的置位，没到的置空。' },
      { en: 'This engine is blunter: it judges the batch whole. If no answer comes back before the acknowledgement times out, every frame in the batch counts a retry, returns to the front of its queue to ride in the next one, and the window doubles as after any collision.',
        zh: '本仿真器要粗糙些：它把这一批当成一个整体判定。若到确认超时为止都没等来回答，这一批里的每一帧都记一次重传，回到队列最前面等着搭下一批，窗口也像碰了一次那样翻倍。' },
    ] },
    { kind: 'table', heading: { en: 'The first batch, added up', zh: '第一批，逐项加起来' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'frames taken, of the 64 allowed', zh: '取走的帧数，允许的是 64' }, N('14')],
      [{ en: 'each of the first thirteen: 4 + 26 + 1 500 + 4, padded', zh: '前十三个每个：4 + 26 + 1 500 + 4，再补齐' }, N('1 536 B')],
      [{ en: 'the last one, unpadded', zh: '最后一个，不补齐' }, N('1 534 B')],
      [{ en: '13 × 1 536 + 1 534', zh: '13 × 1 536 + 1 534' }, N('21 502 B')],
      [{ en: 'time on the air', zh: '在空中的时长' }, N('2 248 µs')],
      [{ en: 'the whole exchange: question, answer, three pauses, batch, BlockAck', zh: '整次交互：提问、回答、三段停顿、这一批、BlockAck' }, N('2 384 µs')],
      [{ en: 'the ceiling on this turn', zh: '本轮的上限' }, N('2 528 µs')],
      [{ en: 'left over, where a fifteenth subframe costs about 160 µs', zh: '剩下的，而第十五个子帧要花约 160 µs' }, N('144 µs')],
    ] },
  ],
  deeper: [
    { heading: { en: 'What sets the size of a batch', zh: '一批的大小由什么决定' }, text: {
      en: 'Two ceilings meet, and the lower one wins. One is structural: the aggregate may hold at most 64 members here, and its total length is bounded by what the receiver agreed to buffer. The other is the clock: the batch, its opening exchange and its answer must all fit inside the interval the winner is allowed to hold the channel for. In this scene the clock binds first, which is why the batch is 14 frames and not 64.',
      zh: '两个上限碰在一起，低的那个说了算。一个是结构上的：这里一个聚合最多容纳 64 个成员，总长度还受接收端答应缓存多少的约束。另一个是时钟：这一批、它的开场交互和它的回答，必须全部装进获胜者被允许占用信道的那段时间里。本场景中先顶到的是时钟，所以这一批是 14 帧，而不是 64 帧。',
    } },
    { heading: { en: 'The marker between members', zh: '成员之间的那段标记' }, text: {
      en: 'Each member is preceded by a short delimiter carrying its length and a check of that length, and is padded so the next one starts on a four-byte boundary. That is what lets a receiver that missed the start of a member skip forward to the next one instead of losing the remainder of the batch, and it is why the batch here is 21 502 bytes rather than 14 × 1 530.',
      zh: '每个成员前面都有一小段定界符，里面写着它的长度以及对这个长度的校验，后面还要补齐，让下一个成员从四字节边界开始。正是这一点，让漏掉某个成员开头的接收端可以直接跳到下一个，而不是把这一批剩下的全都丢掉；也正因为如此，这里的一批是 21 502 字节，而不是 14 × 1 530。',
    } },
    { heading: { en: 'The agreement that has to exist first', zh: '必须先存在的那份约定' }, text: {
      en: 'A receiver cannot answer with a bitmap for a batch it never agreed to hold. Before any of this, the two ends exchange a short request and response that set up the agreement: which traffic class it covers, how many frames may be outstanding, and where the window starts. This simulator assumes the agreement is already in place, so you will not see it on the timeline.',
      zh: '接收端不可能为一批它从未答应缓存的帧回一张位图。在这一切之前，两端要先交换一次简短的请求与响应，把这份约定谈好：覆盖哪一类流量、最多允许多少帧在途、窗口从哪里开始。本仿真器假定这份约定早已谈妥，所以你在时间轴上看不到它。',
    } },
  ],
  sources: [
    { en: 'A-MPDU aggregation, the delimiter, the padding to a four-octet boundary and the 64-subframe ceiling used here are §10.12 and §9.7 of IEEE Std 802.11-2024; the BlockAck frame and its bitmap are §9.3.1.9, and the agreement that precedes it is §10.25.',
      zh: 'A-MPDU 聚合、定界符、补齐到四字节边界，以及这里用的 64 个子帧上限，见 IEEE Std 802.11-2024 的 §10.12 与 §9.7；BlockAck 帧及其位图见 §9.3.1.9，先于它的那份约定见 §10.25。' },
    { en: 'Losing a whole aggregate when any part of it collides is a model choice of this simulator: the standard acknowledges each subframe on its own bit. The seed, the single uploader, the 1 500-byte frames and the coding the run settles on are model choices too.',
      zh: '“聚合中任意一处发生碰撞就整批丢失”是本仿真器的模型取值：标准是按每个子帧各自的比特来确认的。随机种子、这台唯一的上传站点、1500 字节的帧，以及本轮最终采用的编码，同样都是模型取值。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated'),
  ]),
  variants: [
    {
      label: { en: 'Aggregation OFF (same device)', zh: '关闭聚合（同一设备）' },
      scenario: () => sc(oneRoom(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated', { edca: true, txop: true }),
      ]),
    },
  ],
  jumps: [
    J('first A-MPDU', '第一个 A-MPDU', firstAmpdu),
    J('first BlockAck', '第一个 BlockAck', firstBa),
  ],
  observe: [
    { en: 'Every batch here carries a ×14 badge. Hover one: fourteen frames and 21 502 bytes go out under a single preamble, as one transmission of 2 248 µs.', zh: '这里的每一批都带着 ×14 的角标。悬停其中一个：十四帧、21 502 字节在同一个前导下面发出去，是一次时长 2 248 µs 的传输。' },
    { en: 'One lilac BlockAck of 32 bytes, 32 µs long, closes the turn — in place of fourteen separate answers with a pause before each of them.', zh: '一个淡紫色的 BlockAck，32 字节、32 µs，就把这一轮收尾了——它顶替的是十四个独立回答，以及每个回答前面的那段停顿。' },
    { en: 'Load the aggregation-off variant: the same device, the same coding, now sending 1 530-byte frames one at a time, each with its own 28 µs answer.', zh: '载入“关闭聚合”的变体：同一台设备、同样的编码，现在改成一帧一发的 1 530 字节帧，每一帧都要自己那个 28 µs 的回答。' },
  ],
  tryThis: [
    { en: 'Watch the inspector’s queue drain 14 frames per channel win instead of 1. Fourteen is what fits in the time one win may last — it is not the aggregation ceiling, which is 64 frames.', zh: '在检视器里看队列每赢一次信道就清掉 14 帧，而不是 1 帧。14 是“一次获胜允许持续的时间”装得下的数量，并不是聚合的上限——上限是 64 帧。' },
    { en: 'Compare throughput between the two variants. Same coding, same distance, about 1.5 times the delivered frames here; the gap is aggregation’s share alone, since both variants win a turn about as often.', zh: '比较两个变体的吞吐量。同样的编码、同样的距离，这里成功送达的帧数约为 1.5 倍；这个差距只反映聚合本身的贡献，因为两个变体赢下一轮的频率差不多。' },
  ],
  quiz: [
    {
      q: { en: 'Where does most of the gain come from?', zh: '这份收益主要来自哪里？' },
      options: [
        { en: 'A higher coding rate for the batched frames', zh: '打批之后用了更高的编码速率' },
        { en: 'Spreading one turn’s fixed cost over many frames instead of one', zh: '把一轮的固定开销摊到许多帧上，而不是只摊在一帧上' },
        { en: 'Shorter headers inside the batch', zh: '批里的帧头更短了' },
      ],
      answer: 1,
      explain: { en: 'The coding is identical on both sides of the comparison. Only the ratio of ceremony to data changes.', zh: '对比的两边编码完全相同。变的只是“排场与数据”的比例。' },
    },
    {
      q: { en: 'One frame inside a batch fails its check. What does the standard do?', zh: '一批里有一帧校验没过。标准会怎么做？' },
      options: [
        { en: 'The whole batch is sent again', zh: '整批重发' },
        { en: 'Its bit in the answer stays clear, and only that frame is queued again', zh: '它在回答里的那一位保持为空，只有这一帧重新排队' },
        { en: 'The receiver asks for it with a separate request', zh: '接收端另发一条请求专门要它' },
      ],
      answer: 1,
      explain: { en: 'Each member is checked on its own, so the answer can be precise. This simulator is blunter and loses the whole batch.', zh: '每个成员都是单独校验的，所以回答可以很精确。本仿真器要粗糙一些，会把整批丢掉。' },
    },
  ],
}
