/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · OFDMA on the downlink.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says about a downlink HE MU
 * PPDU: the fixed RU sizes and positions (§27.3.2.2, Tables 27-7/27-8), the allocation carried in
 * HE-SIG-B (§27.3.11.8.1, §26.5.1.2), every RU's PSDU padded to one end (§26.5.1.1), and the
 * acknowledgements that have to be solicited by a Trigger frame or a TRS Control subfield and
 * come back in HE TB PPDUs (§10.3.2.13.2, §26.4.4.3). ② what the engine does — an equal 1/n
 * split, at most four members, a fixed 44 + 4 µs opening, and (since W7a, 2026-11-11) BlockAcks
 * solicited by a TRS Control subfield and sent in HE TB PPDUs as the standard says. ③ four runs.
 *
 * What the lesson must never claim is a throughput win: with this fixed video load the frames
 * delivered are identical with OFDMA and without, and the whole gain is 1.044 ms of busy air
 * over 300 ms (the two simultaneous TB PPDUs occupy the air once, not twice). The base scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical; the two variants are the base scene
 * with OFDMA switched off on some nodes. Every figure printed below is read back out of the
 * lesson text in tests/course/ofdma-dl.test.ts.
 */
import { type Lesson, oneRoom, node, sc, txOf, firstMuDl, J } from '../lessonKit'
import type { Scenario } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import { PHY_MODES } from '../../engine/phy'

/** The symbols each half-channel member of the run's MU PPDU needs for its 1438 B A-MPDU. */
export const MU_SYMBOLS = 12

/** µs, one decimal — the unit the timeline and the tables print. */
const us = (ns: number): number => Math.round(ns / 100) / 10

/**
 * One multi-user PPDU of this run, drawn from the PHY's own constants: the opening, the 4 µs the
 * engine charges for the per-user signalling, and the two members' payload. A PHY change moves
 * the figure with the lesson.
 */
export function muPpduFields(): FieldsSpec {
  const m = PHY_MODES.he
  const payloadNs = m.symNs * MU_SYMBOLS
  return {
    kind: 'fields',
    fields: [
      { label: '前导码', size: us(m.preambleNs) },
      { label: '多用户信令', size: us(m.muExtraPreambleNs) },
      { label: '各资源单元的数据', size: us(payloadNs) },
    ],
    unit: 'µs',
    total: `共 ${us(m.preambleNs + m.muExtraPreambleNs + payloadNs)} µs`,
  }
}

/**
 * The lesson's room: one access point and three Wi-Fi 6 televisions. `ofdmaOff` names the nodes
 * whose OFDMA capability is switched off — empty for the base scene, which is therefore the
 * scene the lesson always had, value for value.
 */
export function ofdmaDlScenario(ofdmaOff: readonly string[] = []): Scenario {
  const s = sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
    node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
    node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
  ])
  for (const n of s.nodes) {
    if (ofdmaOff.includes(n.id)) n.caps.features = { ...n.caps.features, ofdma: false }
  }
  return s
}

export const ofdmaDl: Lesson = {
  id: 'ofdma-dl',
  module: 9,
  title: 'OFDMA 下行——一次发送服务多台设备',
  why: 'IEEE 802.11-2024 的高效率（high efficiency, HE）物理层（physical layer, PHY），也就是 Wi-Fi 6，允许接入点（access point, AP）在一次发送里同时服务几台站点（station, STA），即多用户（multi-user, MU）发送：信道的子载波（sub-carrier）按标准的音调表分成若干资源单元（resource unit, RU），每台站点只解调分给自己的那一个。这种方式称为正交频分多址（orthogonal frequency-division multiple access, OFDMA），这样的一次发送称为多用户 PPDU（multi-user PPDU, MU PPDU），本课的发送方向是从接入点到站点，称为下行（downlink, DL）。资源单元的尺寸和位置是标准固定的几种，20 MHz 信道最多分成九个；哪台站点得到哪一个，写在前导码（preamble）的 HE-SIG-B 字段里；各资源单元的数据填充（padding）到同一时刻结束。站点要在同一时刻回复确认，必须由接入点用触发帧（Trigger frame）或 TRS Control 子字段征询，回复是基于触发的 PPDU（trigger-based PPDU, TB PPDU）；没有被征询就不回复。接入点选哪些站点、给每台多大的资源单元，标准不规定。本仿真器把信道等分给至多四个成员；确认照标准征询：每个 MPDU（MAC protocol data unit）带一个 TRS Control 子字段，各成员在自己的资源单元上同时回一个块确认（block acknowledgement, BlockAck）。在本课三台电视的房间里，划分资源单元不会让任何一台电视变快：开与关 OFDMA，每台电视收到的帧完全相同；节省的只是空口时间（airtime），300 ms 里组成 45 对，空口忙碌时间少 1.044 ms。',
  outcomes: [
    '说出标准对下行多用户发送规定了什么：资源单元的尺寸与位置、怎样通告、怎样结束、确认怎样征询',
    '分清本仿真器的哪些做法照标准、哪些是它自己的取法或与标准不同',
    '在时间轴上读出一次多用户发送，并说出 OFDMA 在本课场景里节省的是什么、没有节省什么',
  ],
  needs: ['width', 'txop'],
  terms: [
    { term: 'OFDMA', plain: '正交频分多址：把一条信道划分为若干部分，使一次发送能同时承载发给多台设备的数据' },
    { term: 'resource unit', plain: '资源单元：一次发送中分配给某一台设备的那一组子载波；尺寸只有标准规定的几种' },
    { term: 'RU', plain: '资源单元的简称，也是仿真记录里显示的名称' },
    { term: 'MU', plain: '多用户：指一次发送中的各个部分分别属于不同的设备' },
  ],
  standard: [
    { heading: '资源单元的尺寸与位置（§27.3.2.2，表 27-7、表 27-8）', text: 'HE 物理层定义了七种资源单元：26、52、106、242、484、996 与 2×996 个音调。20 MHz 信道最多容纳九个 26 音调、四个 52 音调、两个 106 音调或一个 242 音调的资源单元（表 27-7）；每个资源单元占哪些子载波，由表 27-8 至表 27-10 固定给出。使用 OFDMA 的 HE MU PPDU 可以混合使用不同尺寸的资源单元。每种尺寸有各自的速率参数表（§27.5.1），一个站点每个符号（symbol）承载的数据比特数由它的资源单元尺寸决定。' },
    { heading: '谁读哪一块（§27.3.11.8.1，§26.5.1.2）', text: 'HE MU PPDU 前导码里的 HE-SIG-B 字段携带 OFDMA 与下行多用户 MIMO（multi-user MIMO, MU-MIMO）的资源分配信息，站点据此找到自己使用的资源。接入点为每个资源单元给出 STA_ID，取接收站点关联标识的低 11 位；没有分配的资源单元记为 2046。HE-SIG-B 的符号数不固定，发给 20 MHz 站点时不得超过 16 个（§26.5.1.1）。' },
    { heading: '同时结束（§26.5.1.1）', text: 'HE MU PPDU 里每个资源单元上的数据都要填充到同一时刻结束，结束时刻由 L-SIG（legacy signal field）字段给出。' },
    { heading: '确认怎样回来（§10.3.2.13.2，§26.4.4.3）', text: 'HE MU PPDU 里的站点要回复确认，须按接入点给出的调度信息回复：接入点在发给它的聚合 MPDU（aggregate MPDU, A-MPDU）里带一个触发帧（例如 MU-BAR 触发帧），或在帧里带 TRS Control 子字段；站点在指定的资源单元上回一个 HE TB PPDU。两者都没有收到，站点就不回复。另一种办法是只让其中一个站点用单用户 PPDU（PHY protocol data unit）回复：这时至多一个 A-MPDU 可以要求立即确认（§26.4.4.3）。' },
    { heading: '交换的成败（§26.5.1.1）', text: '下行多用户 PPDU 带有征询帧时，只要至少一个被征询的站点回复了，这次发送就算成功；一个都没有才算失败。' },
    { heading: '时长上限（§10.13，表 27-61）', text: 'HE PPDU 的时长不得超过 aPPDUMaxTime，即 5.484 ms。' },
    { heading: '标准没有规定什么', text: '标准规定了资源单元的尺寸、位置和通告方式，没有规定接入点选哪些站点组成一次发送，也没有规定给每个站点多大的资源单元；这些由接入点的调度器决定。' },
    { kind: 'steps', heading: '一次下行 OFDMA 交换，按标准：逐步说明', items: [
      '接入点按增强型分布式信道接入（enhanced distributed channel access, EDCA）的规则赢得一次传输机会（transmit opportunity, TXOP）（§26.5.1.1）。',
      '接入点选定站点，从表 27-8 至表 27-10 为每个站点选一个资源单元，写进 HE-SIG-B（§27.3.11.8.1）。',
      '各资源单元的数据填充到同一时刻结束（§26.5.1.1）。',
      '要征询同时回复的确认，接入点在发给各站点的 A-MPDU 里带触发帧，或带 TRS Control 子字段（§10.3.2.13.2）。',
      '一个短帧间间隔（short interframe space, SIFS）之后，每个被征询的站点在指定的资源单元上回一个 HE TB PPDU，其中是它的块确认（§26.5.2.3.1）。',
      '至少一个站点回复，这次交换就算成功（§26.5.1.1）。',
    ] },
  ],
  implementation: [
    { topic: 'PPDU 格式与时长', standard: 'HE MU PPDU，前导码含 HE-SIG-B，HE-SIG-B 的符号数随分配变化（§27.3.11.8，§26.5.1.1）', sim: '三台电视是 HE 站点，接入点发 HE MU PPDU。时长 = 44 µs 前导码 + 4 µs 多用户信令 + 13.6 µs × 符号数；44 µs 与 4 µs 是本仿真器取的代表值，不按字段逐项相加，也不随成员数变化。', kind: 'value' },
    { topic: '资源单元尺寸', standard: '七种固定尺寸，位置由表 27-8 至表 27-10 给出（§27.3.2.2）', sim: '不按音调表划分：每个成员分到信道的 1/n，n 是成员数；两个成员各占一半。', kind: 'differs' },
    { topic: '选哪些站点', standard: '标准未规定', sim: '只看接入点此刻的同一个接入类别（access category, AC）队列（queue）：有数据、并协商过 OFDMA 的目的站点不少于两个，才组成一次多用户发送，按排队先后取前四个；不足两个就发单用户帧。', kind: 'choice' },
    { topic: '成员数上限', standard: '20 MHz 最多九个资源单元（表 27-7）', sim: '至多四个成员。', kind: 'value' },
    { topic: '同时结束', standard: '各资源单元的数据填充到同一时刻结束（§26.5.1.1）', sim: '整次发送的时长取所需最长的那个成员，各成员同时结束。', kind: 'faithful' },
    { topic: '确认的征询', standard: '须由触发帧或 TRS Control 征询，回复是 HE TB PPDU；未被征询不回复（§10.3.2.13.2）', sim: '照此：不发触发帧，每个 MPDU 带 4 字节的 HT Control 字段，其中的 TRS Control 子字段（§9.2.4.7.1）指定回复用的 HE TB PPDU；每个成员在一个 SIFS 之后在自己的资源单元上回一个块确认，各成员同时开始，本课每个 72.8 µs。', kind: 'faithful' },
    { topic: 'HE TB PPDU 的参数', standard: 'TRS Control 给出上行（uplink, UL）数据符号数（UL Data Symbols）、资源单元与调制与编码方式（modulation and coding scheme, MCS），后者取 HE-MCS 0–3，取值由接入点选择（§9.2.4.7.1，§26.5.2.3.4）', sim: '每个成员回复用的资源单元是它在多用户发送里的那一份；HE-MCS 取成员自己的 MCS 与 3 中较小者（本课是 3），一条空间流（spatial stream），1.6 µs 保护间隔，数据符号数按需要最多的成员定（本课 2 个）。', kind: 'choice' },
    { topic: '交换的成败', standard: '至少一个被征询的站点回复即成功（§26.5.1.1）', sim: '至少一个成员回了块确认就按成功处理；块确认位图（bitmap）里没有确认的 MPDU 重新排队，计一次重传（retry），没有回复的成员整份重发。', kind: 'faithful' },
    { topic: '时长上限', standard: 'aPPDUMaxTime 5.484 ms（表 27-61）', sim: '同样取 5.484 ms，还要放得进传输机会的剩余时间。', kind: 'faithful' },
    { topic: '相邻资源单元之间', standard: '标准给出各资源单元的子载波位置，不规定接收机怎样处理相邻资源单元的泄漏', sim: '同一次发送的各部分互不计入干扰。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '第一次多用户发送',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次多用户发送。',
        '把鼠标悬停在这一帧上，读出成员、每个成员的字节数和这一帧的时长；对照下图与下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '这一帧的时间用在哪里', spec: muPpduFields(), caption: '前导码和多用户信令整组只发一次；两个成员的数据在频率上并列。' },
        { kind: 'table', heading: '第一次多用户发送，按本仿真器的公式算一遍', head: ['步骤', '数值'], rows: [
          ['此刻队列中有数据的电视', '2'],
          ['每个成员分到的信道', '1/2'],
          ['每个成员每符号比特数', '1950 × 0.5 = 975'],
          ['每个成员的字节', '1438 B'],
          ['每个成员的符号数', '⌈(16 + 8 × 1438 + 6) ÷ 975⌉ = ⌈11526 ÷ 975⌉ = 12'],
          ['这一帧的时长', '44 + 4 + 13.6 × 12 = 211.2 µs'],
        ] },
      ],
      expect: '你应该看到：1068.7 µs 接入点发出一个 211.2 µs 的 HE MU PPDU，成员是电视 3 和电视 1，各承载 1438 字节的 A-MPDU（一个 MPDU，带 4 字节 HT Control 字段）、各占半条信道、各需 12 个符号；电视 2 不在其中，那一刻接入点的队列里没有发给它的帧。',
      meaning: '这说明：两个成员同时结束，这是标准的要求（①）；每个成员分到半条信道、时长按 44 + 4 + 13.6 × 符号数计算，是本仿真器的取法（②）。',
    },
    {
      heading: '两个块确认同时开始',
      jump: 1,
      steps: [
        '跳到同时发出的块确认。',
        '读出两个块确认的发送者、开始时刻、时长和格式，再往前查看有没有触发帧，并在多用户发送的帧字段里找到 TRS Control 子字段。',
      ],
      expect: '你应该看到：1295.9 µs，即那一帧结束后 16 µs，电视 1 和电视 3 同时开始各自的块确认，各 72.8 µs，都是 HE TB PPDU，各占半条信道；整段运行里接入点一个触发帧也没有发。',
      meaning: '这说明：征询这两个确认的是多用户发送里每个 MPDU 带的 TRS Control 子字段，不需要触发帧，回复是 HE TB PPDU，与标准一致（①②）。HE TB PPDU 用 HE-MCS 3、1.6 µs 保护间隔，又要带自己的前导码，所以比 24 Mb/s 的确认帧（acknowledgement, ACK）长得多（②）。',
    },
    {
      heading: '开与关 OFDMA：同样的帧，更少的空口时间',
      more: [0],
      steps: [
        '依次载入本课场景与「OFDMA 全部关闭」，各运行 300 ms。',
        '对照下表读出接入点的发送次数、每台电视收到的帧数和空口忙碌的总时间；同时发出的几帧只算一次。',
      ],
      blocks: [
        { kind: 'table', heading: '300 ms，开与关 OFDMA', head: ['测量项', '开 OFDMA', '关 OFDMA'], rows: [
          ['接入点的数据发送次数', '1016', '1061'],
          ['其中包含两台电视的', '45', '0'],
          ['电视 1 / 2 / 3 收到的帧', '352 / 355 / 354', '352 / 355 / 354'],
          ['空口忙碌的总时间', '161.9 ms', '163.0 ms'],
        ] },
        { kind: 'table', heading: '同样两个视频帧，两种发法', head: ['发法', '前导码', '每帧的符号', '空口时间', '确认'], rows: [
          ['逐帧发送', '44 µs × 2', '6 + 6', '125.6 µs × 2', '两个 28 µs 的确认帧，先后发送'],
          ['一个 HE MU PPDU', '44 + 4 µs', '12', '211.2 µs', '两个 72.8 µs 的块确认，同时开始'],
        ] },
      ],
      expect: '你应该看到：开 OFDMA 时接入点发了 1016 次，其中 45 次包含两台电视；关掉后发了 1061 次。每台电视收到的帧两种情况完全相同。空口忙碌时间少 1.044 ms：每组成一对，前导码省下 40 µs；两个块确认同时发出，只占 72.8 µs，但比先后发送的两个确认帧又多用 16.8 µs，45 × 23.2 µs = 1.044 ms。',
      meaning: '这说明：在平稳的视频流里，OFDMA 不增加送达的数据，只节省空口时间，标准也没有承诺更多（①）；组队的机会少，是因为本仿真器只把此刻队列里有数据的电视编在一起（②）。',
    },
    {
      heading: '一台电视不协商 OFDMA',
      variant: 1,
      steps: [
        '载入「电视 1 关闭 OFDMA」，运行 300 ms。',
        '统计多用户发送的次数和成员。',
      ],
      expect: '你应该看到：多用户发送只剩 11 次，成员都是电视 2 和电视 3；电视 1 只被单独服务。',
      meaning: '这说明：只有协商过 OFDMA 的站点才会被编入（②的分组规则）；组队次数从 45 降到 11，取决于两条队列同时有数据的时刻。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§27.3.2.2 与表 27-7、表 27-8（资源单元的尺寸、数目与位置）、§27.5.1（各尺寸资源单元的速率参数）、§27.3.11.8.1（HE-SIG-B 的资源分配信息）、§26.5.1.2（STA_ID）、§26.5.1.1（各资源单元同时结束、HE-SIG-B 的符号数、下行多用户交换的成败）、§10.3.2.13.2 与 §26.4.4.3（多用户 PPDU 的确认怎样征询）、§9.2.4.7.1（TRS Control 子字段）、§26.5.2.3.1（HE TB PPDU 在 SIFS 之后发送）、§26.5.2.3.4（TRS Control 征询的 HE TB PPDU）、§10.13 与表 27-61（aPPDUMaxTime 5.484 ms）。',
    '本仿真器的取值与取法：44 µs 前导码、4 µs 多用户信令与 13.6 µs 的符号（代表值，不逐字段相加）；信道按成员数等分；一次至多四个成员；回复块确认的 HE TB PPDU 取 HE-MCS 3；同组互不干扰。1016、45、352 / 355 / 354、161.9 ms 等计数来自本课场景 300 ms 的运行，可以复现。',
  ],
  limits: [],
  scenario: () => ofdmaDlScenario(),
  variants: [
    { label: 'OFDMA 全部关闭', scenario: () => ofdmaDlScenario(['ap', 'sta-1', 'sta-2', 'sta-3']) },
    { label: '电视 1 关闭 OFDMA', scenario: () => ofdmaDlScenario(['sta-1']) },
  ],
  jumps: [
    J('第一次多用户发送', firstMuDl),
    J('同时发出的块确认', txOf((r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup !== undefined)),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '两个块确认在同一瞬间开始。它们为什么不会碰撞？',
      options: [
        '它们足够短，不会真的重叠',
        '各自在自己的资源单元上应答，因此它们在频率上并列，而不是叠加在一起',
        '接入点事后消除了干扰',
      ],
      answer: 1,
      explain: 'OFDMA 划分的是频率而不是时间。位于信道不同部分的两次传输互不重叠，这正是确认能够同时发出的原因。',
    },
    {
      q: '启用 OFDMA 之后，每台电视收到的帧与不启用时完全相同。那么 OFDMA 在本课场景里带来了什么？',
      options: [
        '没有任何收益——分组只在上行（uplink, UL）才有意义',
        '空口时间：同样的视频数据用更少的发送时间送达，节省的时间留给了其他设备',
        '每台电视的速率更高了',
      ],
      answer: 1,
      explain: '平稳的视频流需要多少数据就是多少，分组不可能多送。它用更少的固定开销传送同样多的数据——这里是在 300 ms 内节省了 1.044 ms 的空口时间。',
    },
    {
      q: '按 IEEE 802.11-2024，HE MU PPDU 里的站点怎样回块确认？',
      options: [
        '数据收完后自动在自己的资源单元上回复',
        '接入点用触发帧或 TRS Control 征询，站点按其中的调度信息回一个 HE TB PPDU；没有被征询就不回复',
        '每个站点各自竞争信道之后再回复',
      ],
      answer: 1,
      explain: '§10.3.2.13.2 要求站点按触发帧或 TRS Control 里的调度信息回复，两者都没有收到就不回复。本仿真器照此在每个 MPDU 里带 TRS Control 子字段。',
    },
  ],
}
