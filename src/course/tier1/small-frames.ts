/**
 * Wi-Fi Tier 1 · M3 · lesson 4: what a small frame costs, and what one preamble
 * buys when fourteen frames queue up behind it.
 *
 * The SECOND half of `frame-anatomy-bytes`, split per
 * docs/superpowers/plans/2026-09-25-course-repacing-proposal.md §2 · M3. It
 * loads exactly the scene its parent loads — `frameAnatomyScenario`, no variant
 * — so the split adds no scenario and this lesson's recorded hash is
 * `frame-anatomy-bytes`', value for value (`sameSceneAs` in its shape suite).
 *
 * Standard-first shape (2026-11-10): ① IEEE Std 802.11-2024 — the control
 * frame formats (§9.3.1.2–§9.3.1.4, the Compressed BlockAck of §9.3.1.8), the
 * A-MPDU and its delimiter (§9.7.1), the Duration settings of an RTS-protected
 * burst (§9.2.5.2, §9.2.5.6), the RTS threshold (§10.3.5) and the control frame
 * rates (§10.6.6); ② where this simulator follows it — sizes, layout,
 * durations, EOF padding, MPDU-by-MPDU reception and the BlockAck bitmap — and
 * where it does not: a delimiter CRC that is counted but never computed, no
 * ADDBA; ③ three runs.
 *
 * 2026-11-11 (W7a): the A-MPDU is padded to PSDU_LENGTH (§10.12.6) — 21 502 octets
 * before the EOF padding, 21 525 after — and received MPDU by MPDU with a bitmap that
 * reports exactly the MPDUs received (§9.7.2, §9.3.1.8.2). No airtime figure moved.
 *
 * Every figure the lesson prints is read back out of its text and compared
 * with a run in tests/course/small-frames.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { J, type Lesson } from '../lessonKit'
import {
  frameAnatomyScenario, firstRtsFrame, firstAmpduFrame, firstBlockAck,
} from './frame-anatomy'

/**
 * The burst this lesson walks: fourteen frames, in octets, as the run builds it — the A-MPDU
 * before the EOF padding (APEP_LENGTH, which its airtime is computed from) and the PSDU after it.
 */
export const BURST_MPDUS = 14
export const BURST_APEP_BYTES = 21_502
export const BURST_BYTES = 21_525
/** The instants the figure prints, exactly as the lab's table writes them. */
export const RTS_AT = '2.298 ms'
export const BURST_AT = '2.386 ms'
export const BA_AT = '4.650 ms'

/**
 * One protected burst, end to end: the reservation, the go-ahead, the fourteen
 * frames behind one preamble and the single reply. The instants in the gutter
 * are read back out of the run by the test, so the figure cannot drift from
 * the timeline.
 */
export function burstSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-3', label: '笔记本' },
      { id: 'ap', label: '路由器' },
    ],
    messages: [
      { from: 'sta-3', to: 'ap', label: 'RTS 20 B', at: RTS_AT },
      { from: 'ap', to: 'sta-3', label: 'CTS 14 B' },
      { from: 'sta-3', to: 'ap', label: '14 帧组成的 A-MPDU', at: BURST_AT, tone: 'accent' },
      { from: 'ap', to: 'sta-3', label: 'BlockAck 32 B', at: BA_AT },
    ],
  }
}

export const smallFrames: Lesson = {
  id: 'small-frames',
  module: 2,
  title: '小帧的开销，以及共用前导码的收益',
  why: '上一课的结论是：一帧的空口时间（airtime）= 前导码（preamble）+ 整数个符号（symbol）。确认帧（acknowledgement, ACK）这样的控制帧（control frame）只有帧控制（Frame Control）、持续时间（Duration/ID）、接收端地址（receiver address, RA）与帧校验序列（frame check sequence, FCS），共 14 个八位组，没有任何载荷（payload），却同样要占用整段前导码；即使把它的字节数再减少一半，最多也只节省一个符号。小帧逐个发送时，每一帧都要付出一次前导码、一次信道竞争和一次单独确认的开销。IEEE 802.11-2024 §9.7 允许把许多 MPDU（MAC protocol data unit）依次排列在同一个 PPDU（PHY protocol data unit）里，构成聚合 MPDU（aggregate MPDU, A-MPDU）：每个 MPDU 仍保留自己的帧头（MAC header）与 FCS，前面加一个 4 个八位组的定界符（MPDU delimiter）；接收端最后只回复一个块确认（block acknowledgement, BlockAck），用一张位图（bitmap）说明哪几帧已经收到。节省的不是帧头和校验，而是重复的前导码、竞争与确认。本课这一串超过了场景设定的 RTS 门限（RTS threshold），所以笔记本先发送请求发送（request to send, RTS）帧，路由器回复允许发送（clear to send, CTS）帧；这两个小帧合计还不到后面那一串的百分之三。每一帧写入的持续时间（Duration/ID）覆盖的都是这次交换的剩余部分，所以最后的 BlockAck 写 0。本仿真器照标准计算这些帧的长度、排列与持续时间，也逐帧判定接收、用位图逐帧确认；只是定界符中的循环冗余校验（cyclic redundancy check, CRC）只计入长度，并不实际计算。',
  outcomes: [
    '按标准说出确认帧、RTS、CTS 与 BlockAck 各自携带哪些字段、各占多少字节',
    '按 §9.7.1 算出十四帧组成一个 A-MPDU 之后的字节数，并说出节省的是什么',
    '读懂一次受 RTS/CTS 保护的交换中每一帧写入的持续时间各覆盖哪一段',
    '分清本仿真器在 A-MPDU 上哪些照标准、哪些与标准不同',
  ],
  needs: ['frame-anatomy-bytes'],
  terms: [
    { term: 'A-MPDU', plain: '聚合 MPDU：把许多 MPDU 依次排列，装进同一个 PPDU 一次发出' },
    { term: 'BlockAck', plain: '块确认：一整串帧只换回的一个确认，其中有一张位图说明哪几帧已经收到' },
  ],
  standard: [
    { kind: 'table', heading: '控制帧的字段（§9.3.1.2–§9.3.1.4，§9.3.1.8.2，图 9-41 至图 9-43，图 9-52，图 9-54）', head: ['帧', '字段（八位组）', '合计'], rows: [
      ['Ack', '帧控制 2，持续时间 2，RA 6，FCS 4', '14 B'],
      ['CTS', '帧控制 2，持续时间 2，RA 6，FCS 4', '14 B'],
      ['RTS', '帧控制 2，持续时间 2，RA 6，TA 6，FCS 4', '20 B'],
      ['Compressed BlockAck（64 帧的位图）', '帧控制 2，持续时间 2，RA 6，TA 6，BA Control 2，起始序列控制 2，位图 8，FCS 4', '32 B'],
    ] },
    { heading: '各帧的接收方（§9.3.1.3，§9.3.1.4，§9.3.1.8.1）', text: 'CTS 回应 RTS 时，CTS 的 RA 取自 RTS 的发送端地址（transmitter address, TA）；Ack 的 RA 取自被确认那一帧的地址 2；BlockAck 的 RA 是发起请求的一方，TA 是发送 BlockAck 的一方。Compressed BlockAck 的起始序列控制（Sequence Control）字段给出起始序号（sequence number），位图从这个序号开始，每一位对应一份 MSDU（MAC service data unit），为 1 表示已经收到。' },
    { heading: 'A-MPDU（§9.7.1，图 9-1326、图 9-1328，表 9-659）', text: 'A-MPDU 由一个或多个子帧（subframe）组成。每个子帧以 4 个八位组的 MPDU 定界符（MPDU delimiter）开头，后面是一个 MPDU；除最后一个子帧外，每个子帧都用填充（padding）补到 4 个八位组的整数倍。HT PPDU 中最后一个子帧不填充；VHT 与 HE PPDU 中，最后一个子帧可以带 0 到 3 个填充八位组，其后还可以有 EOF 填充，按 §10.12.6 的规则确定。' },
    { kind: 'table', heading: 'MPDU 定界符（图 9-1329，表 9-659）', head: ['子字段', '比特', '作用'], rows: [
      ['EOF/Tag', '1', '帧结束指示或标记'],
      ['保留', '1', '无'],
      ['MPDU Length', '14', '后面那个 MPDU 的八位组数'],
      ['CRC', '8', '对前面 16 位的校验'],
      ['Delimiter Signature', '8', '固定图样 0x4E，便于接收端搜索定界符'],
    ] },
    { heading: '定界符为什么带校验（§9.7.2）', text: '定界符中的 8 位循环冗余校验（cyclic redundancy check, CRC）只保护它自己的前 16 位。定界符用来在 A-MPDU 中定位每个 MPDU；一个或几个定界符出错时，接收端通常仍能恢复整串帧的结构。每个 MPDU 也各有自己的 FCS，接收端逐个校验，BlockAck 的位图逐帧报告结果。' },
    { kind: 'steps', heading: '一次受 RTS/CTS 保护的 A-MPDU 交换，按标准：逐步说明', items: [
      'PSDU（PHY service data unit）的长度超过 dot11RTSThreshold，发送端先发送 RTS（§10.3.5）。RTS 的持续时间等于后面的 A-MPDU、一个 CTS、一个 BlockAck 与其间三个短帧间间隔（short interframe space, SIFS）之和（§9.2.5.2）。',
      '接收端相隔 SIFS 回复 CTS；CTS 的持续时间等于 RTS 的持续时间减去从 RTS 结束到 CTS 结束的时间，即一个 SIFS 加 CTS 本身（§9.2.5.6）。',
      '发送端相隔 SIFS 发出 A-MPDU（§10.3.5）。其中每个服务质量（quality of service, QoS）数据帧（data frame）的确认策略（Ack Policy）是 Implicit BAR，持续时间等于一个 BlockAck 加一个 SIFS（§9.2.5.2，表 9-13）。',
      '接收端相隔 SIFS 回复 BlockAck；它的持续时间等于数据帧的持续时间减去从 A-MPDU 结束到 BlockAck 结束的时间（§9.2.5.6），这次交换到此结束。',
    ] },
    { heading: '控制帧的速率（§10.6.6.2，§10.6.6.5.2，表 17-23）', text: '用非 HT PPDU 发送、开始一次发送机会的控制帧（如 RTS），使用 BSSBasicRateSet 中的速率；该集合为空时使用物理层（physical layer, PHY）的强制速率（mandatory rate）。CTS、Ack 与 BlockAck 作为回应帧，取 BSSBasicRateSet 中不高于所回应那一帧速率的最高速率；没有这样的速率时，取不高于它的最高强制速率。20 MHz 非 HT 物理层的强制速率是 6、12 与 24 Mb/s。' },
    { heading: '块确认协议（§10.25）', text: '发送 Implicit BAR 的 A-MPDU 之前，双方要先建立块确认协议，在管理帧（management frame）中协商缓冲区大小等参数。' },
  ],
  implementation: [
    { topic: '控制帧的长度', standard: 'Ack 与 CTS 14 B，RTS 20 B，Compressed BlockAck 32 B（§9.3.1）', sim: '照此取值。', kind: 'faithful' },
    { topic: '子帧的排列', standard: '定界符 4 B，非最后子帧补到 4 的倍数（§9.7.1）', sim: '照此计算：每个子帧 4 B 定界符加 MPDU 再补到 4 的倍数，最后一个子帧不补。', kind: 'faithful' },
    { topic: 'VHT 中最后一个子帧的填充', standard: 'VHT 与 HE PPDU 中可有 0 到 3 个填充八位组与 EOF 填充（§9.7.1，§10.12.6）', sim: '照此：时长按 EOF 填充之前的长度计算，然后给最后一个子帧补到 4 的倍数，再加 EOF 填充子帧与填充八位组，补满最后一个符号。本课第一个 A-MPDU 补 2 + 5 × 4 + 1 = 23 B。', kind: 'faithful' },
    { topic: '定界符的内容', standard: 'EOF/Tag、MPDU Length、CRC-8、签名 0x4E（表 9-659）', sim: 'EOF/Tag 照 §10.12.7 填写，MPDU Length 就是后面那个 MPDU 的长度；CRC-8 只计入长度，并不实际计算，接收端也不靠定界符恢复结构。', kind: 'differs' },
    { topic: '逐帧校验与位图', standard: '每个 MPDU 各自校验，位图逐帧报告（§9.7.2，§9.3.1.8.2）', sim: '照此逐帧判定：每个 MPDU 按它在数据字段中所占那一段期间的信干噪比（signal-to-interference-plus-noise ratio, SINR）各自判定（不计算 FCS），BlockAck 的位图只标出收到的 MPDU。本课第一个 BlockAck 标出了全部 14 帧。', kind: 'faithful' },
    { topic: '持续时间', standard: 'RTS、CTS、A-MPDU 中的数据帧与 BlockAck 的取法（§9.2.5.2，§9.2.5.6）', sim: '照此计算，以纳秒保存。', kind: 'faithful' },
    { topic: 'RTS 门限', standard: 'dot11RTSThreshold，取值由管理实体设定（§10.3.5）', sim: '由场景参数给出，本场景 2000 B。', kind: 'value' },
    { topic: '控制帧的速率', standard: '按 BSSBasicRateSet 与强制速率选取（§10.6.6）', sim: '没有 BSSBasicRateSet：RTS 与各回应帧都取不高于参考速率的最高强制速率，本课这几个控制帧都是 24 Mb/s。', kind: 'value' },
    { topic: 'A-MPDU 的长度', standard: 'A-MPDU 长度与 PPDU 时长有最大值（§9.7.1；HE 的 aPPDUMaxTime 为 5.484 ms，表 27-61）', sim: '最多 64 个子帧、最长 5.484 ms，实际聚合多少由队列（queue）中当时的帧数决定。', kind: 'value' },
    { topic: '块确认协议', standard: '先建立协议再使用 Implicit BAR（§10.25）', sim: '未实现建立过程：支持 A-MPDU 的一对设备从一开始就视为已建立。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一次受保护的 A-MPDU 交换',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个 RTS，展开“空中字段”读出持续时间。',
        '依次跳到随后的 CTS、A-MPDU 与 BlockAck，读出它们的长度、空口时间与持续时间。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一次受保护的 A-MPDU 交换', spec: burstSequence(), caption: '四个帧中只有第三个承载载荷。图中的时刻就是时间轴上的时刻。' },
        { kind: 'table', heading: '四个帧', head: ['帧', '发送时刻', '长度', '空口时间', '持续时间'], rows: [
          ['RTS', '2.298 ms', '20 B', '28 µs', '2356 µs'],
          ['CTS', '2.342 ms', '14 B', '28 µs', '2312 µs'],
          ['A-MPDU（14 帧）', '2.386 ms', '21 525 B', '2248 µs', '48 µs'],
          ['BlockAck', '4.650 ms', '32 B', '32 µs', '0 µs'],
        ] },
      ],
      expect: 'RTS 的 2356 µs 等于 28 + 2248 + 32 + 3 × 16；CTS 的 2312 µs 是它减去 16 µs 的 SIFS 与 28 µs 的 CTS；A-MPDU 中的帧写 48 µs，即 SIFS 加 BlockAck；BlockAck 写 0。RTS 与 CTS 合计 56 µs，不到 A-MPDU 时长的百分之三。',
      meaning: '持续时间的取法照 §9.2.5.2 与 §9.2.5.6（①）。三个控制帧都以 24 Mb/s 发送，这是本仿真器在没有 BSSBasicRateSet 时的取法（②）。',
    },
    {
      heading: '十四帧怎样排在一个前导码后面',
      jump: 1,
      steps: [
        '跳到第一个 A-MPDU，展开“空中字段”，读出子帧数与每个子帧的长度。',
        '对照下表，按 §9.7.1 计算整串的字节数，再按 §10.12.6 加上 EOF 填充。',
      ],
      blocks: [
        { kind: 'table', heading: '一个子帧，以及十四个子帧', head: ['步骤', '数值'], rows: [
          ['一个 MPDU', '26 + 1500 + 4 = 1530 B'],
          ['补到 4 的倍数', '1532 B'],
          ['加上 4 B 的定界符', '1536 B'],
          ['十四个子帧，最后一个先不补', '13 × 1536 + 1534 = 21 502 B'],
          ['EOF 填充：最后一个子帧补 2 B，再加 5 个 4 B 的 EOF 填充子帧与 1 B', '21 525 B'],
        ] },
      ],
      expect: 'EOF 填充之前整串 21 502 B，空口时间按它计算：以 VHT 的调制与编码方式（modulation and coding scheme, MCS）8 发送，2248 µs；EOF 填充把最后一个符号补满，PSDU 共 21 525 B，不多占时间。路由器以一个 32 B 的 BlockAck 确认全部 14 帧。',
      meaning: '子帧的排列照 §9.7.1，最后一个子帧的填充与 EOF 填充照 §10.12.6（①、②）；每个 MPDU 各自判定，位图逐帧报告（②）。',
    },
    {
      heading: '提高 RTS 门限',
      steps: [
        '在编辑器里把 RTS 门限改为 30 000 B，再载入。',
        '找到笔记本的第一个 A-MPDU，看它前面有没有 RTS 与 CTS。',
      ],
      expect: 'A-MPDU 前不再有 RTS 与 CTS：第一个 A-MPDU 在 2.298 ms 直接发出，含 15 帧、23 046 B，仍小于新的门限；整个运行中没有一个 RTS。',
      meaning: '§10.3.5：PSDU 超过 dot11RTSThreshold 才必须先交换 RTS/CTS（①）；门限的取值由场景给出（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§9.3.1.2–§9.3.1.4 与图 9-41 至图 9-43（RTS、CTS、Ack）、§9.3.1.8 与图 9-52、图 9-54（BlockAck）、§9.7.1 与图 9-1326、图 9-1328、图 9-1329、表 9-659（A-MPDU 与定界符）、§9.7.2（定界符的校验）、§10.12.6（VHT 与 HE 中的填充）、§9.2.5.2 与 §9.2.5.6（持续时间）、表 9-13（确认策略）、§10.3.5（RTS 门限）、§10.6.6.2 与 §10.6.6.5.2（控制帧的速率）、表 17-23（强制速率）、表 27-61（aPPDUMaxTime）、§10.25（块确认）。',
    '本仿真器的取值与取法：RTS 门限 2000 B（场景参数）；控制帧取不高于参考速率的最高强制速率；最多 64 个子帧、最长 5.484 ms（src/engine/phy.ts 的 MAX_AMPDU_MPDUS 与 MAX_PPDU_NS）；每个 MPDU 按它所占那一段的信干噪比判定，不计算 FCS；定界符的 CRC 只计入长度。各帧的时刻、长度与时长都是本课场景的实测值。',
  ],
  limits: [],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个 RTS', firstRtsFrame),
    J('第一个 A-MPDU', firstAmpduFrame),
    J('第一个 BlockAck', firstBlockAck),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '十四帧装进同一个 A-MPDU，真正节省的是什么？',
      options: [
        '节省了帧头和校验：十四帧变成了一帧',
        '节省了十三个前导码、十三次信道竞争，以及十三个单独的确认帧',
        '空口时间没有任何节省；节省的只是发送端的处理开销',
      ],
      answer: 1,
      explain: '每个 MPDU 都保留自己的帧头和 FCS——这一串在 EOF 填充之前就有 21 502 B，原因就在这里。节省的是它们外部那些重复的开销。',
    },
    {
      q: '一个 14 B 的确认帧占 28 µs，其中 20 µs 是前导码与 SIGNAL。把它缩减为 7 个字节，能节省多少时间？',
      options: [
        '一半：14 µs',
        '最多 4 µs——它仍要占用整数个符号，而前导码保持不变',
        '完全不节省：小帧的时长是固定的',
      ],
      answer: 1,
      explain: '14 B 在 24 Mb/s 下需要两个符号，7 B 只需要一个，节省的就是那一个 4 µs 的符号。',
    },
    {
      q: '哪一项是本仿真器与标准不同之处？',
      options: [
        'RTS 是 20 B，CTS 是 14 B',
        '定界符中的 8 位 CRC 只计入长度，并不实际计算',
        'BlockAck 的位图只标出收到的 MPDU',
      ],
      answer: 1,
      explain: '另外两项照标准（①）；标准的定界符带一个对前 16 位的校验，供接收端在出错后找回后面的 MPDU，本仿真器只计入它的 8 位（②）。',
    },
  ],
}
