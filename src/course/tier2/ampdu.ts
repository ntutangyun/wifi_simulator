/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · A-MPDU, paying the fixed cost once.
 *
 * **Standard-first shape (2026-11-11).** ① states what IEEE Std 802.11-2024 specifies: the A-MPDU
 * format and the MPDU delimiter (§9.7.1, §9.7.2, Table 9-659), its contents (§9.7.3), the length
 * limits — the recipient's Maximum A-MPDU Length Exponent (§10.12.2), aPPDUMaxTime (§10.13,
 * Table 21-28) and the TXOP (§10.23.2.8) — padding in a VHT PPDU (§10.12.6), and the block ack
 * agreement and BlockAck frame (§10.25.1, §9.3.1.8, §10.25.6.7). ② says what the engine does:
 *  - it decodes an A-MPDU as ONE unit, so the BlockAck carries no per-MPDU bitmap and a failure
 *    retries every MPDU of the attempt (`failMsdus` in src/engine/mac.ts) — differs;
 *  - the final subframe is never padded (the HT rule), where the scene's VHT PPDU pads it and
 *    fills the PSDU with EOF padding (§10.12.6) — differs;
 *  - the ADDBA handshake, the delimiter CRC and the deaggregation it enables are absent;
 *  - 64 MPDUs is an engine constant standing in for the negotiated buffer size, and 3000 octets
 *    the engine's RTS threshold (dot11RTSThreshold defaults to 6 500 631, i.e. off).
 *
 * The scenario builder and the variant are unchanged, so the recorded timeline hashes stay
 * identical. Every figure below is pinned in tests/course/ampdu.test.ts against 200 ms runs.
 */
import type { FieldsSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstBa, firstAmpdu, J } from '../lessonKit'

/**
 * One subframe of this run's first batch, to scale: the engine's own `ampduSubframeBytes(1500)`
 * broken into the four parts it sums and the padding it rounds up with. 4 + 26 + 1500 + 4 = 1534,
 * padded to 1536, which is why the batch is 21 502 bytes and not 14 × 1 530.
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
  why: '站点（station, STA）每取得一次信道都有一段与数据量无关的固定开销：等待、倒数、前导码（preamble）、末尾的确认帧（acknowledgement, ACK）。电台速率越高，数据所占的时间越短，这段固定开销所占的比例就越大。IEEE 802.11-2024 的办法是把发往同一个接收端的多个 MPDU（MAC protocol data unit）首尾相接，放在一个 PPDU（PHY protocol data unit）里一次发出，这叫聚合 MPDU（aggregate MPDU, A-MPDU）。每个 MPDU 保留自己的帧头（MAC header）、载荷（payload）和帧校验序列（frame check sequence, FCS），前面加一个 4 字节的定界符（MPDU delimiter），组成一个子帧（subframe）；接收端只回一个块确认（block acknowledgement, BlockAck），用其中的位图（bitmap）逐个报告收到了哪些帧，发送方只重传（retry）没有被确认的帧。一批能装多少帧，受接收端声明的最大长度、PPDU 的最长时长和这一次传输机会（transmit opportunity, TXOP）的剩余时间限制。本课的场景里先起限制作用的是 TXOP：一批 14 帧。同样的编码、距离和字节，每送达一帧占用的空口时间（airtime）从 228.3 µs 降到 168.9 µs，整轮送达的帧数约为不聚合时的一倍半。本仿真器把一批当作一个整体判定，块确认里没有逐帧的位图，任何一处失败都整批重传；本场景里没有发生失败，所以看不到这一差别。',
  outcomes: [
    '说出 A-MPDU 子帧的组成，以及一批的长度受哪几条约束',
    '说明块确认怎样逐帧报告接收结果，并指出本仿真器在哪里与标准不同',
    '读出聚合与不聚合时每送达一帧占用的空口时间',
  ],
  needs: ['small-frames', 'frame-qos-fcs', 'retries-queues'],
  terms: [
    { term: 'A-MPDU', plain: '聚合 MPDU：多个 MPDU 首尾相接，放在一个 PPDU 里一次发出' },
    { term: 'subframe', plain: 'A-MPDU 里的一个成员：定界符、一个完整的 MPDU，以及补齐到 4 字节的填充' },
    { term: 'BlockAck', plain: '块确认：一个应答覆盖一批帧，位图里每一位对应一个帧，表示是否收到' },
  ],
  standard: [
    { heading: 'A-MPDU 的格式（§9.7.1）', text: 'A-MPDU 由一个或多个 A-MPDU 子帧组成。每个子帧是一个 4 字节的 MPDU 定界符，后面跟一个 MPDU；除最后一个子帧外，每个子帧末尾加填充（padding），使子帧长度是 4 字节的整数倍。在 HT PPDU 里最后一个子帧不加填充；在 VHT PPDU 里，还要按 §10.12.6 给最后一个子帧补齐，再加 EOF 填充子帧与填充字节，使 A-MPDU 恰好等于物理层（physical layer, PHY）给出的 PSDU（PHY service data unit）长度。' },
    { kind: 'table', heading: 'MPDU 定界符（图 9-1329，表 9-659）', head: ['字段', '位数', '内容'], rows: [
      ['EOF/Tag', '1', 'MPDU 长度为 0 时表示帧结束填充；长度非零时是标记位'],
      ['保留', '1', '—'],
      ['MPDU Length', '14', '后面那个 MPDU 的字节数'],
      ['CRC', '8', '对前 16 位的 8 位循环冗余校验（cyclic redundancy check, CRC）'],
      ['Delimiter Signature', '8', '固定为 0x4E，用于搜寻定界符'],
    ] },
    { heading: '定界符的用途（§9.7.2）', text: '定界符用来在 A-MPDU 里找到每个 MPDU 的位置；有一个或几个定界符收错时，接收端通常仍能恢复 A-MPDU 的结构，继续找到后面的 MPDU（解聚合的算法见附录 O.2）。' },
    { heading: '内容与长度的约束（§9.7.3，§10.12.2，§10.13，§10.23.2.8）', text: '一个 A-MPDU 里的所有 MPDU 接收端地址（receiver address, RA）相同，发送端地址（transmitter address, TA）相同。长度受三条约束：不超过接收端在能力元素里声明的最大 A-MPDU 长度；PPDU 的时长不超过 aPPDUMaxTime，VHT PPDU 为 5.484 ms（表 21-28）；在 TXOP 里发送时，A-MPDU 加上预期的块确认必须短于 TXOP 剩余的时间。' },
    { heading: '块确认协议与块确认帧（§10.25.1，§9.3.1.8，§9.3.1.8.2）', text: '块确认机制先由 ADDBA 请求与响应帧建立一份协议，接收端在其中给出缓存的数量；此后发送方可以连续发送一批服务质量（quality of service, QoS）数据帧（data frame），用一个块确认帧确认。块确认帧由帧控制（Frame Control）、持续时间（Duration/ID）、RA、TA、BA 控制、BA 信息与 FCS 组成；压缩块确认的 BA 信息是 2 字节的起始序列控制（Block Ack Starting Sequence Control）加 8 或 32 字节的位图，位图里为 1 的每一位按序号（sequence number）顺序确认一个帧，第一位对应起始序号。' },
    { kind: 'steps', heading: '一次 A-MPDU 交换，按标准：逐步说明', items: [
      '发送方与接收端已经用 ADDBA 请求与响应建立块确认协议（§10.25.1）。',
      '发送方取发往同一接收端、属于同一业务标识（traffic identifier, TID）的若干 QoS 数据帧，在长度与时长的约束内组成 A-MPDU（§9.7.3、§10.12.2、§10.13）。',
      '每个 QoS 数据帧的确认策略（Ack Policy）设为 Normal Ack；只要其中有一帧被正确收到，发送方就预期在一个短帧间间隔（short interframe space, SIFS）之后收到块确认（§10.25.6.7.1）。',
      '接收端逐个检查每个 MPDU 的帧校验序列，在块确认的位图里把收到的帧置 1（§9.3.1.8.2）。',
      '发送方按位图得知哪些帧没有收到；块确认本身丢失时，发送方可以发块确认请求帧要求重发块确认，也可以直接重传那些数据帧（§10.25.6.7.1）。',
    ] },
  ],
  implementation: [
    { topic: '子帧的组成', standard: '定界符 4 字节 + MPDU，非最后一个子帧补齐到 4 字节（§9.7.1）', sim: '4 + 26（QoS 帧头）+ 1500 + 4 = 1534 字节，补齐到 1536。', kind: 'faithful' },
    { topic: '最后一个子帧与 EOF 填充', standard: 'VHT PPDU 里按 §10.12.6 补齐并加 EOF 填充，A-MPDU 长度等于 PSDU 长度', sim: '按 HT 的规则处理：最后一个子帧不补齐，也不加 EOF 填充，所以一批是 13 × 1536 + 1534 字节。本场景的上传站点用的是 VHT。', kind: 'differs' },
    { topic: '定界符的内容', standard: '长度、CRC 与签名，用于在出错后恢复结构（§9.7.2）', sim: '只计入 4 字节，不生成字段内容，也不做出错后的解聚合。', kind: 'absent' },
    { topic: '块确认协议的建立', standard: '先用 ADDBA 请求与响应建立协议，接收端给出缓存数量（§10.25.1）', sim: '直接假定协议已经存在，时间轴上没有 ADDBA 帧。', kind: 'absent' },
    { topic: '一批最多几帧', standard: '受接收端声明的最大长度与协议的缓存数量约束（§10.12.2）', sim: '固定为 64 帧，与接收端无关。', kind: 'value' },
    { topic: 'PPDU 时长与 TXOP', standard: '不超过 aPPDUMaxTime 5.484 ms（§10.13）；A-MPDU 加块确认短于 TXOP 剩余时间（§10.23.2.8）', sim: '照此逐帧加入，下一帧会超出任一约束就停在它之前。', kind: 'faithful' },
    { topic: '逐帧确认', standard: '接收端逐个检查 MPDU，位图逐帧报告（§9.3.1.8.2）', sim: '把一批当作一个整体判定：块确认的长度是 32 字节，与带 8 字节位图的压缩块确认相同，但没有位图的内容；收到块确认就是整批成功，没有收到就是整批失败。', kind: 'differs' },
    { topic: '失败之后', standard: '只重传位图里没有确认的帧；块确认丢失时可以发块确认请求，也可以重传数据帧（§10.25.6.7.1）', sim: '一次尝试失败时，这次尝试里的每一帧都记一次重传（retry），一起回到队头，窗口加倍。', kind: 'differs' },
    { topic: '请求发送（request to send, RTS）的门限', standard: 'dot11RTSThreshold 的默认值为 6 500 631 字节，即默认不做 RTS 交换（附录 C）', sim: 'RTS 门限（RTS threshold）取 3000 字节，所以每一批之前都先有一次 RTS 与允许发送（clear to send, CTS）的交换。', kind: 'value' },
  ],
  labs: [
    {
      heading: '打开第一批',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个 A-MPDU。',
        '查看它的帧数、字节数与时长，再对照下表逐项累加。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一批里的一个子帧', spec: ampduSubframeFields(), caption: '定界符、帧头与校验共 34 字节，加 1 500 字节载荷，再补齐到 1 536 字节。' },
        { kind: 'table', heading: '第一批，逐项累加', head: ['步骤', '数值'], rows: [
          ['这一批的帧数，上限是 64', '14'],
          ['前十三个子帧，每个 4 + 26 + 1 500 + 4，补齐', '1 536 B'],
          ['最后一个子帧，不补齐', '1 534 B'],
          ['13 × 1 536 + 1 534', '21 502 B'],
          ['这一批的时长', '2 248 µs'],
          ['整次交换：RTS、CTS、三段 SIFS、这一批、块确认', '2 384 µs'],
          ['BE 的 TXOP 上限（TXOP limit）', '2 528 µs'],
          ['剩余时间；多加一个子帧，这一批要长', '144 µs；156 µs'],
        ] },
      ],
      expect: '你应该看到：0 µs 发出 RTS，44 µs 收到 CTS，88 µs 起发出一个 21 502 字节、14 帧的 A-MPDU，时长 2 248 µs。多加第十五个子帧会使这一批长 156 µs，超出 TXOP 剩下的 144 µs，所以停在 14 帧。',
      meaning: '这说明：一批的长度受 TXOP 约束（①），本仿真器照此逐帧加入（②）；64 帧的上限在这里没有起作用。',
    },
    {
      heading: '一个块确认覆盖整批',
      jump: 1,
      steps: [
        '跳到第一个块确认。',
        '查看它与那一批之间的间隔，以及它的长度与时长。',
      ],
      expect: '你应该看到：那一批在 2 336 µs 结束，16 µs 之后接入点（access point, AP）发出块确认，32 字节、32 µs。',
      meaning: '这说明：一次 SIFS、一个块确认代替了十四次 SIFS 加确认帧（①）。本仿真器的块确认只有长度，没有位图的内容（②）。',
    },
    {
      heading: '聚合与不聚合',
      more: [0],
      steps: [
        '依次载入本课场景与「关闭聚合（同一设备）」，各运行 200 ms。',
        '统计每台上传站点赢得的 TXOP 数、送达的帧数与发出的全部帧的空口时间。',
      ],
      blocks: [
        { kind: 'formula', heading: '一次交换里每送达一帧占用的时间', text: '聚合：   (28 + 28 + 2 248 + 32) µs ÷ 14 帧 = 166.9 µs\n不聚合：(200 + 28) µs ÷ 1 帧        = 228.0 µs', note: '只计入发送的时间，不计 SIFS。同样的编码、同样的字节、同一个房间。' },
        { kind: 'table', heading: '200 ms 里的两种方式', head: ['200 ms 之内', '聚合', '不聚合'], rows: [
          ['赢得的 TXOP', '81', '83'],
          ['每个 TXOP 送达的帧数', '13.8', '8.9'],
          ['送达的帧数', '1 120', '738'],
          ['每送达一帧占用的空口时间', '168.9 µs', '228.3 µs'],
          ['重传', '0', '0'],
        ] },
      ],
      expect: '你应该看到：两种方式赢得的 TXOP 数几乎相同，但聚合时送达 1 120 帧，不聚合时 738 帧，约为 1.5 倍。不聚合并不是一个 TXOP 只发一帧：它在 TXOP 里同样连续发送八九帧，只是每帧都有自己的前导码和确认帧。两边都没有一次重传。',
      meaning: '这说明：收益来自固定开销分摊到更多帧上，与速率无关（①）。实测值比算式略高，是因为 200 ms 结束时最后一批已经发出、还没有送达。这里只有一台站点，没有失败，所以本仿真器整批判定的简化（②）在这里看不出代价。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§9.7.1（A-MPDU 格式与填充）、图 9-1329 与表 9-659（MPDU 定界符）、§9.7.2（定界符的用途，附录 O.2）、§9.7.3（同一 RA、同一 TA）、§10.12.2（最大 A-MPDU 长度）、§10.12.6（VHT、HE PPDU 的填充）、§10.13 与表 21-28（aPPDUMaxTime 5.484 ms）、§10.23.2.8（A-MPDU 加块确认短于 TXOP 剩余时间）、§10.25.1（块确认协议）、§9.3.1.8 与 §9.3.1.8.2（块确认帧与压缩块确认的位图）、§10.25.6.7.1（发送方的处理）、附录 C 的 dot11RTSThreshold。',
    '本仿真器的取值与取法：64 帧上限、3000 字节的 RTS 门限、整批判定、最后一个子帧不补齐。唯一的上传站点、1500 字节的帧与本轮采用的编码都是本仿真器的场景，可以复现。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '聚合带来的收益主要来自哪里？',
      options: [
        '聚合之后使用了更高的编码速率',
        '一次取得信道的固定开销分摊到许多帧上',
        '子帧的帧头更短',
      ],
      answer: 1,
      explain: '对比的两边编码完全相同，变的只是固定开销与数据的比例。',
    },
    {
      q: '一批里有一帧的帧校验序列不正确。按标准会怎样？',
      options: [
        '整批重传',
        '它在块确认位图里的那一位为 0，发送方只重传这一帧',
        '接收端另发一个请求，专门要求重传这一帧',
      ],
      answer: 1,
      explain: '§9.3.1.8.2：位图逐帧报告接收结果。本仿真器把一批当作一个整体判定，会整批重传。',
    },
    {
      q: '本课场景里，一批停在 14 帧的原因是什么？',
      options: [
        '一批最多 64 帧',
        'PPDU 不能长于 5.484 ms',
        '再加一帧，整次交换就超出 BE 的 TXOP 上限',
      ],
      answer: 2,
      explain: '整次交换 2 384 µs，离 2 528 µs 的上限只剩 144 µs，而第十五个子帧会使这一批长 156 µs。',
    },
  ],
}
