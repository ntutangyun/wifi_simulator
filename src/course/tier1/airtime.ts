/**
 * Wi-Fi Tier 1 · M3 · lesson 5: one exchange, and how much of it is not your
 * payload.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says about the
 * exchange this lesson times: the HE TXTIME (§27.4.3), the symbol and guard-interval
 * constants (§27.3.9 Table 27-13), the Ack frame (§9.3.1.4), the SIFS that precedes it
 * (§10.3.2.3.3, §10.3.2.11), the control response rate (§10.6.6.5.2 with §10.6.11) and the
 * AckTimeout. ② what this simulator does with each — including the four places it departs:
 * a single 44 µs preamble constant where the standard adds fields up to 43.2 µs, the BCC
 * symbol count on an MCS the standard codes with LDPC only, 52.8 instead of 52.0 µs on the
 * quadruple tier, and no propagation delay. ③ four runs.
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json is byte-identical. Every figure printed below is read
 * back out of the lesson text in tests/course/airtime.test.ts and compared with a run.
 *
 * 2026-11-11 (W7a): an HE PSDU is always an A-MPDU (§9.7.3, §10.12.5), so the 1430-octet MPDU goes
 * out as an S-MPDU — 4 octets of delimiter, APEP_LENGTH 1434, still six symbols — padded to a
 * 1459-octet PSDU by the EOF padding (§10.12.6). Every airtime figure is unchanged; the frame's
 * octet count is, and the guard-interval lab now counts delivered MPDU octets.
 */
import { PHY_MODES, SIFS_NS, TGI_NS, mcsRateMbps, symNsFor, txTimeModeNs } from '../../engine/phy'
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstData, firstAck, J } from '../lessonKit'

/**
 * The one exchange this lesson times, in microseconds. The data frame and the
 * answer are measured in the run; the preamble and the pause are the engine's
 * own constants, read from `PHY_MODES` and `SIFS_NS` rather than typed again.
 */
// 125.6 is `giNumbers()[0].frameUs`, and a test welds the two.
export const DATA_US = 125.6
export const PREAMBLE_US = PHY_MODES.he.preambleNs / 1000
export const SIFS_US = SIFS_NS / 1000
export const ACK_US = 28
export const EXCHANGE_US = DATA_US + SIFS_US + ACK_US

/**
 * The three guard-interval tiers, as the lesson's own table prints them. Every cell is read
 * back out of the PHY's own functions. The frame is this lesson's own: a 1430-octet MPDU in an
 * S-MPDU, APEP_LENGTH 1434 octets, at HE MCS 11, 20 MHz, one stream, one user. The symbol COUNT
 * is six in all three tiers.
 */
export const APEP_BYTES = 1434
const GI_ROWS = [
  { gi: TGI_NS.base, name: '基本' },
  { gi: TGI_NS.double, name: '双倍' },
  { gi: TGI_NS.quad, name: '四倍' },
] as const

export function giNumbers(): { giUs: number; name: string; symUs: number; frameUs: number; mbps: number }[] {
  return GI_ROWS.map(({ gi, name }) => ({
    giUs: gi / 1000,
    name,
    symUs: symNsFor('he', gi) / 1000,
    frameUs: txTimeModeNs('he', APEP_BYTES, 11, { widthMhz: 20, giNs: gi }) / 1000,
    mbps: mcsRateMbps('he', 11, gi),
  }))
}

/**
 * The exchange, drawn to scale: the preamble, the payload's symbols, the gap
 * that is the pause, and the answer. Every duration comes from `PHY_MODES` or
 * from the run, so the test reads them back out of this spec.
 */
export function exchangeTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '接入点', spans: [
        { label: '前导码', fromUs: 0, toUs: PREAMBLE_US },
        { label: '6 个符号', fromUs: PREAMBLE_US, toUs: DATA_US, tone: 'accent' },
      ] },
      { label: '电视', spans: [
        { label: '确认帧', fromUs: DATA_US + SIFS_US, toUs: EXCHANGE_US },
      ] },
    ],
    // 141.6 — the instant the answer starts — is not a tick: its label collides with
    // 125.6's at every panel width, and the 16 µs gap is what the figure draws anyway.
    axis: { fromUs: 0, toUs: EXCHANGE_US, ticks: [0, PREAMBLE_US, DATA_US, EXCHANGE_US], unit: 'µs' },
  }
}

export const airtime: Lesson = {
  id: 'airtime',
  module: 2,
  title: '帧要花“空口时间”',
  why: '在一个房间里的一条信道上，同一时刻只能有一台设备发送，所以无线网络真正分配的是时间，而不是字节。IEEE 802.11-2024 用 TXTIME 公式给出一帧占用的空口时间（airtime）：开头是长度固定的前导码（preamble），后面是整数个数据符号（symbol），载荷（payload）翻倍时只有符号数翻倍。一次收发交互还包括一段短帧间间隔（short interframe space, SIFS）和接收方回复的确认帧（ACK）：发送方无法在发送的同时接收，只有确认帧能证明这一帧已经到达。确认帧的速率不是固定值，而是基本速率集里不超过数据帧（data frame）参考速率的最高一档；基本速率集里没有合适的速率时，取不超过它的最高一档强制速率（mandatory rate）。在本课的房间里，一次视频交互共 169.6 µs，传送载荷的只有 81.6 µs，其余都是固定开销。加长保护间隔（guard interval）会使每个符号都变长，同一级编码因此有三个速率；这个房间的空口远未占满，四倍保护间隔多用的空口时间全部落在原本空闲的时间里，送达的字节数不变。',
  outcomes: [
    '按标准把一次收发交互分为四段，说出其中哪一段承载载荷（payload）',
    '按控制回应速率（control response rate）的规则算出确认帧（ACK）的速率与时长',
    '分清本仿真器的帧时长哪些照标准计算、哪些是它自己的取值',
  ],
  needs: ['mcs-ladder', 'small-frames'],
  terms: [
    { term: 'ACK', plain: '确认帧：接收方立即回复的一个小帧，表示“这一帧已完整收到”' },
    { term: 'payload', plain: '帧中真正承载待发送数据的部分' },
  ],
  standard: [
    { heading: '一帧的空口时间（§27.4.3，表 27-13）', text: '高效率（high efficiency, HE）PPDU（PHY protocol data unit） 的时长由 §27.4.3 的式 (27-149) 给出：前导码部分、数据符号、可能的中间导码、包扩展（packet extension）依次相加。前导码部分由 L-STF（legacy short training field）8 µs、L-LTF（legacy long training field）8 µs、L-SIG（legacy signal field）4 µs、RL-SIG 4 µs、HE-SIG-A 8 µs、HE-STF 4 µs 共 36 µs，再加若干个 HE-LTF 符号组成（表 27-13）。数据符号的时长是 12.8 µs 的离散傅里叶变换周期加一段保护间隔：0.8、1.6、3.2 µs 三档，对应 13.6、14.4、16 µs 的符号（表 27-13）。随载荷变长的只有数据符号的个数。HE PPDU 承载的 PSDU（PHY service data unit）总是一个聚合 MPDU（aggregate MPDU, A-MPDU）（§9.7.3）：只发一个 MPDU（MAC protocol data unit）时，它是 A-MPDU 中唯一的子帧（subframe），前面有一个 4 个八位组的定界符（MPDU delimiter），其中 EOF/Tag 位为 1，这样的 MPDU 称为 S-MPDU，仍按单个帧的规则回复确认帧（§10.12.7，§10.12.8）。数据符号的个数按加 EOF 填充（padding）之前的 A-MPDU 长度 APEP_LENGTH 计算；最后一个符号余下的位置由 EOF 填充补满，所以 PSDU 的长度 PSDU_LENGTH 大于 APEP_LENGTH，却不多占时间（§10.12.6）。' },
    { heading: '保护间隔的作用（§27.3.23）', text: '发送过程把 TXVECTOR 的 GI_TYPE 指定的保护间隔插在每一个数据符号之前，用来对抗时延扩展（delay spread）。3.2 µs 的保护间隔与 4x HE-LTF 配合使用，每个 HE-LTF 符号长 12.8 + 3.2 µs（表 27-13；组合见表 9-49 的「4x HE-LTF + 3.2 µs GI」）。' },
    { heading: '确认帧（§9.3.1.4，§10.3.2.11）', text: '确认帧（Ack frame）是 14 字节的控制帧（control frame）：帧控制（Frame Control）2 字节、持续时间（Duration/ID）2 字节、接收地址 6 字节、帧校验序列（frame check sequence, FCS）4 字节。收到需要立即确认的帧后，接收方在一个 SIFS 之后发送确认帧，不管介质（medium）忙闲。SIFS 是从上一个 PPDU 结束到下一个 PPDU 前导码开始的时间（§10.3.2.3.3），在 5 GHz 频段为 16 µs（aSIFSTime：HE PHY 见表 27-61，第 17 章 OFDM PHY 见表 17-24）。' },
    { heading: '确认帧的速率（§10.6.6.5.2，§10.6.11）', text: '以非 HT 格式发送的确认帧，主速率取基本速率集（BSSBasicRateSet）里不超过上一帧速率的最高一档；上一帧是 HE 帧时，先按它的调制（modulation）与码率在表 10-10 里查出非 HT 参考速率，1024-QAM（quadrature amplitude modulation）5/6 对应 54 Mb/s。基本速率集里没有这样的速率时，取所用物理层（physical layer, PHY）的强制速率里不超过它的最高一档；第 17 章正交频分复用（orthogonal frequency-division multiplexing, OFDM）PHY 在 20 MHz 信道上的强制速率是 6、12、24 Mb/s（§17.1.1）。它的时长按 §17.4.3：TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × 字节数 + 6) ÷ 每符号数据比特数⌉ µs。' },
    { kind: 'steps', heading: '一次收发交互，按标准：逐步说明', items: [
      '发送方发出数据帧，占用 §27.4.3 给出的 TXTIME：前导码部分加整数个数据符号。',
      '接收方正确收到后，在一个 SIFS 之后回复确认帧，速率是控制回应速率（control response rate）：基本速率集里不超过数据帧参考速率的最高一档；没有就取不超过它的最高强制速率（§10.6.6.5.2）。',
      '确认帧是 14 字节，以非 HT 格式发送，时长按 §17.4.3 计算。',
      '发送方从数据帧发完时起等待 AckTimeout，即 aSIFSTime + aSlotTime + aRxPHYStartDelay；期间没有检测到任何接收开始，就判定这次发送失败（§10.3.2.11）。',
    ] },
  ],
  implementation: [
    { topic: '前导码部分的时长', standard: '36 µs 加若干个 HE-LTF 符号，逐个字段相加（§27.4.3，表 27-13）；一个 2x HE-LTF、0.8 µs 保护间隔时为 43.2 µs', sim: '取单一常数 44.0 µs，不随空间流（spatial stream）数与 HE-LTF 个数变化。', kind: 'differs' },
    { topic: '包扩展', standard: '式 (27-149) 含包扩展，0 到 16 µs（§27.4.3，表 27-13）', sim: '不加包扩展。', kind: 'absent' },
    { topic: '数据符号的时长', standard: '12.8 µs 加保护间隔：13.6、14.4、16 µs（表 27-13）', sim: '照此取值。', kind: 'faithful' },
    { topic: '数据符号的个数', standard: '调制与编码方式（modulation and coding scheme, MCS）第 10、11 级只能用 LDPC 编码，符号数按 §27.3.12.5.2 计算（§27.3.12.5）', sim: '一律按 ⌈(16 + 8 × 字节数 + 6) ÷ 每符号数据比特数⌉ 计数，这是 BCC 编码的算法，含 6 个尾比特（tail bits）。字节数照 ① 取 APEP_LENGTH：1430 字节的 MPDU 加 4 字节定界符，即 1434 字节，6 个符号；补上 EOF 填充，PSDU 为 1459 字节。', kind: 'differs' },
    { topic: '四倍保护间隔的前导码部分', standard: '4x HE-LTF 每个符号 16 µs，一个 HE-LTF 时前导码部分为 36 + 16 = 52.0 µs（表 27-13）', sim: '在 44.0 µs 上加 8.8 µs，即 52.8 µs。', kind: 'differs' },
    { topic: '保护间隔的收益', standard: '用来对抗时延扩展（§27.3.23）', sim: '不建模多径时延扩展：加长保护间隔只有时间代价，接收端的判决不受影响。', kind: 'absent' },
    { topic: '确认帧的格式', standard: '14 字节（§9.3.1.4）', sim: '14 字节，以非 HT 格式发送。', kind: 'faithful' },
    { topic: '确认帧的速率', standard: '基本速率集里不超过参考速率的最高一档，没有才取强制速率；还可以选备用速率（§10.6.6.5.2，§10.6.6.5.4）', sim: '没有基本速率集，直接在 6、12、24 Mb/s 里取不超过参考速率的最高一档，相当于基本速率集恰好是这三档；不选备用速率。', kind: 'value' },
    { topic: '非 HT 参考速率', standard: '按调制与码率查表 10-10（§10.6.11）', sim: '照表取值：第 11 级（1024-QAM 5/6）对应 54 Mb/s。', kind: 'faithful' },
    { topic: '应答前的间隔', standard: '标称 16 µs，允许偏差 ±10% × (aSlotTime − aAirPropagationTime)（§10.3.2.3.3）', sim: '每个确认帧都恰好在帧尾之后 16 µs 开始，没有偏差。', kind: 'faithful' },
    { topic: '传播时延', standard: 'aSlotTime 中含 aAirPropagationTime（§10.3.7）；其他站点（station, STA）看到的间隔在 SIFS 与 SIFS + aAirPropagationTime 之间（§10.3.2.3.3 NOTE）', sim: '没有传播时延：帧在接收端与发送端同一纳秒开始、同一纳秒结束。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '一次收发交互的四段',
      jump: 0,
      steps: [
        '载入本课场景，跳到接入点（access point, AP）发出的第一个数据帧，把鼠标悬停在它上面，读出大小、速率与时长。',
        '跳到第一个确认帧，读出它的开始时刻与时长，与数据帧的结束时刻比较。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一次交互的时间分配（按比例绘制）', spec: exchangeTiming(), caption: '中间那段空白就是 16 µs 的短帧间间隔。' },
        { kind: 'table', heading: '这个房间里的一次交互', head: ['组成', '时长', '依据'], rows: [
          ['数据帧的前导码', '44.0 µs', '本仿真器的常数（②）'],
          ['6 个数据符号 × 13.6 µs', '81.6 µs', '表 27-13 的符号时长'],
          ['整个数据帧（PSDU 1459 字节，第 11 级）', '125.6 µs', '前两行之和'],
          ['应答之前的间隔', '16 µs', 'aSIFSTime'],
          ['确认帧（14 字节，24 Mb/s）', '28 µs', '§17.4.3'],
          ['整次交互', '169.6 µs', '固定开销 88.0 µs，载荷 81.6 µs'],
        ] },
      ],
      expect: '你应该看到：每个数据帧都装着一个 1430 字节的 MPDU，PSDU 是 1459 字节、125.6 µs；确认帧在数据帧结束后 16 µs 开始，持续 28 µs。前 100 ms 里有 117 个数据帧、116 个确认帧，每个确认帧前的间隔都是 16 µs。169.6 µs 的交互中只有 81.6 µs 在传送载荷。',
      meaning: '这说明：前导码、间隔和确认帧都不随载荷变化，这是 ① 的 TXTIME 公式的结构；44.0 µs 是本仿真器的取值，按表 27-13 逐个字段相加是 43.2 µs（②）。',
    },
    {
      heading: '确认帧的速率与时长',
      jump: 1,
      steps: [
        '跳到第一个确认帧，读出它的速率。',
        '按 ① 的规则自己算一遍：先查数据帧的非 HT 参考速率，再在强制速率里取不超过它的最高一档，最后用 §17.4.3 的公式算时长。',
      ],
      blocks: [
        { kind: 'formula', heading: '确认帧的时长', text: 'TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × 14 + 6) ÷ 96⌉ = 20 + 4 × 2 = 28 µs', note: '96 是 24 Mb/s 每个符号承载的数据比特数。' },
      ],
      expect: '你应该看到：确认帧的速率是 24 Mb/s。数据帧第 11 级的非 HT 参考速率是 54 Mb/s，6、12、24 Mb/s 中不超过 54 Mb/s 的最高一档是 24 Mb/s；14 字节在 24 Mb/s 下是 2 个符号，加 20 µs 的前导码部分，共 28 µs。',
      meaning: '这说明：确认帧的速率由数据帧决定，规则见 ① 的控制回应速率；本仿真器没有基本速率集，所以直接落在强制速率上（②）。',
    },
    {
      heading: '空口有多忙',
      steps: [
        '载入本课场景，运行 100 ms。',
        '把所有数据帧与确认帧的时长加起来，与 100 ms 比较。',
      ],
      expect: '你应该看到：117 个数据帧与 116 个确认帧共占用 17.9 ms，即前 100 ms 的 17.9 %；两次交互之间泳道空闲。',
      meaning: '这说明：这个房间的空口远未占满。占用率取决于场景的业务量，与标准无关；本课的视频业务模型是本仿真器的场景取值。',
    },
    {
      heading: '加长保护间隔',
      variant: 0,
      steps: [
        '依次载入本课场景与「四倍保护间隔（3.2 µs）」，各运行 150 ms。',
        '对照下面两张表读出符号时长、帧时长、送达的 MPDU 字节数与空口时间。',
      ],
      blocks: [
        { kind: 'table', heading: '同一帧，三档保护间隔', head: ['保护间隔', '一个符号', '这一帧（APEP_LENGTH 1434 字节，6 个符号）', '第 11 级的速率'], rows: giNumbers().map((r) => [
          `${r.giUs} µs（${r.name}）`,
          `${r.symUs} µs`,
          `${r.frameUs} µs`,
          `${r.mbps} Mb/s`,
        ]) },
        { kind: 'table', heading: '150 ms 内两种保护间隔', head: ['保护间隔', '帧数', '送达的 MPDU 字节数', '空口时间'], rows: [
          ['0.8 µs', '350', '250 250', '26.88 ms'],
          ['3.2 µs', '350', '250 250', '30.94 ms'],
        ] },
      ],
      expect: '你应该看到：三档保护间隔下这一帧都是 6 个符号，只是每个符号变长；四倍保护间隔时帧数与送达的 MPDU 字节数都不变，空口时间从 26.88 ms 增加到 30.94 ms。',
      meaning: '这说明：符号时长按 ① 的表 27-13 随保护间隔变化，同一级编码因此有三个速率；本仿真器不建模时延扩展，所以这里只看得到代价（②），这一轮的代价全部落在原本空闲的时间里。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§27.4.3（HE PPDU 的 TXTIME，式 (27-149)）、§27.3.9 表 27-13（各字段时长、保护间隔与符号时长）、§9.7.3 与 §10.12.6 至 §10.12.8（HE 的 PSDU 总是 A-MPDU、APEP_LENGTH 与 EOF 填充、S-MPDU）、§27.3.12.5（MCS 10、11 只用 LDPC）、§27.3.23（保护间隔对抗时延扩展）、§27.5 表 27-86（第 11 级的三列速率）、表 9-49（4x HE-LTF + 3.2 µs GI）。',
    '§9.3.1.4（确认帧格式）、§10.3.2.11（确认过程与 AckTimeout）、§10.3.2.3.3（SIFS）、表 27-61 与表 17-24（aSIFSTime 16 µs）、§10.6.6.5.2 与 §10.6.6.5.4（控制回应帧的主速率与备用速率）、§10.6.11 与表 10-10（非 HT 参考速率）、§17.1.1（强制速率 6、12、24 Mb/s）、§17.4.3（非 HT 帧的 TXTIME）。',
    '本仿真器的取值与取法：44.0 µs 的 HE 前导码部分常数、没有包扩展、按 BCC 算法计数符号、四倍保护间隔时加 8.8 µs、没有基本速率集、没有传播时延。',
    '1430 字节的 MPDU、产生它的视频业务模型，以及两台设备在房间里的位置，都是本仿真器的场景取值，标准正文里没有这些数字。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  variants: [
    {
      label: '四倍保护间隔（3.2 µs）',
      scenario: () => ({ ...airtime.scenario(), guardInterval: { gi: 'quad' } }),
    },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: 'Wi-Fi 为什么非要有确认帧？',
      options: [
        '为了通知其他站点保持安静',
        '发送方自己检测不到碰撞，所以 ACK 是它唯一的送达凭据',
        '为了把接收方偏好的速率带回给发送方',
      ],
      answer: 1,
      explain: '无线电发送时无法接收，所以一帧发完后信道安静本身不能说明任何问题。按 §10.3.2.11，发送方在 AckTimeout 内收不到确认帧，就判定这次发送失败。',
    },
    {
      q: '两帧载荷相同，其中一帧用了更慢的编码。哪一帧占用信道的时间更长？',
      options: [
        '编码更快的那一帧',
        '编码更慢的那一帧',
        '一样长——空口时间只取决于字节数',
      ],
      answer: 1,
      explain: '每个符号承载的比特越少，同样的载荷就需要越多符号，而每个符号的时长相同。两种情况下前导码部分完全相同。',
    },
    {
      q: '把这一帧的载荷减半，那 169.6 µs 的交互会怎样？',
      options: [
        '也跟着减半',
        '减少 40.8 µs——正好是不再需要的那三个符号',
        '完全不变',
      ],
      answer: 1,
      explain: '减少的只有符号数，从六个变成三个。前导码、间隔和应答帧都没有变，所以整次交互为 128.8 µs。',
    },
    {
      q: '按标准，确认帧的速率怎样确定？',
      options: [
        '永远是 6 Mb/s，好让每台设备都能解调',
        '基本速率集里不超过数据帧参考速率的最高一档；没有就取不超过它的最高强制速率',
        '与数据帧用同一个速率',
      ],
      answer: 1,
      explain: '这是 §10.6.6.5.2 的控制回应速率规则。本课的数据帧参考速率是 54 Mb/s，所以确认帧用 24 Mb/s。',
    },
  ],
}
