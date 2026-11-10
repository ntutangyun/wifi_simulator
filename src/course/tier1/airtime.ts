/**
 * Wi-Fi Tier 1 · M3 · lesson 5: one exchange, and how much of it is not your
 * payload.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md), and
 * re-paced on 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M3, §4, §5.1 item 1, §5.2 and §5.3). It stays ONE lesson and gets
 * materially smaller, because it was carrying another lesson's procedure:
 *  - the six-step bytes→microseconds derivation and its worked table are
 *    `frame-anatomy-bytes`'s, taught there in full. What is left here is the
 *    answer's own rate and the pause before it, and a citation for the rest.
 *  - the two paragraphs that restated the exchange table's totals are gone, and
 *    a `timing` figure draws the exchange to scale instead (§4).
 *  - the voice metaphors the re-pacing named are gone with them.
 *
 * Every number quoted below is pinned in tests/course/airtime.test.ts, against
 * the lesson's own scene. The scenario builder is unchanged, so the recorded
 * timeline hash in tests/fixtures/lesson-hashes.json is byte-identical.
 */
import { PHY_MODES, SIFS_NS, TGI_NS, mcsRateMbps, symNsFor, txTimeModeNs } from '../../engine/phy'
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstData, firstAck, J } from '../lessonKit'

/**
 * The one exchange this lesson times, in microseconds. The data frame and the
 * answer are measured in the run; the preamble and the pause are the engine's
 * own constants, read from `PHY_MODES` and `SIFS_NS` rather than typed again.
 */
// 125.6 is `giNumbers()[0].frameUs`, and a test welds the two: this figure has an
// instrument now rather than being a number the lesson remembers.
export const DATA_US = 125.6
export const PREAMBLE_US = PHY_MODES.he.preambleNs / 1000
export const SIFS_US = SIFS_NS / 1000
export const ACK_US = 28
export const EXCHANGE_US = DATA_US + SIFS_US + ACK_US

/**
 * The three guard-interval tiers, as the lesson's own table prints them.
 *
 * **Not one literal.** Every cell is read back out of the PHY's own functions, so the table
 * cannot drift from the engine and the test can recompute each cell independently (§4's
 * `echoFacts` rule). The frame is this lesson's own: 1430 octets at HE MCS 11, 20 MHz, one
 * stream, one user.
 *
 * The symbol COUNT is six in all three tiers — only each symbol's length changes — and that is
 * the sentence the prose below turns on. The quadruple tier also carries the 4x LTF with it
 * (§1.4's pairing), so its preamble is 52.8 µs rather than 44.0.
 */
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
    frameUs: txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs: gi }) / 1000,
    mbps: mcsRateMbps('he', 11, gi),
  }))
}

/**
 * The exchange, drawn to scale: the preamble, the payload's symbols, the gap
 * that is the pause, and the answer. The gap is the SIFS — a timing figure
 * shows a pause by the absence of a span — and every duration here comes from
 * `PHY_MODES` or from the run, so the test reads them back out of this spec.
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
  why: '在一个房间里的一条信道上，同一时刻只能有一台设备发送。视频流、文件上传、手机收取邮件，都必须共用同一个空口，一帧接一帧地传送。所以真正需要计算的不是字节，而是时间。一次收发交互占用信道的时间分为四段：数据帧（data frame）开头的前导码（preamble）、承载载荷（payload）的若干数据符号（symbol）、一段固定的短暂间隔，以及接收方回复的确认帧（ACK）。随载荷变长的只有符号那一段：载荷翻倍，符号数翻倍，前导码保持不变。这个房间里的一次视频交互，真正传送载荷的时间还不到一半，其余都是固定开销。确认帧不能省略：发送方在发送时无法接收其他信号，因而无法察觉碰撞，只有接收方的应答能证明这一帧已经到达；它的速率也不是固定值，而是取不超过数据帧速率的最高一档强制速率（mandatory rate）。加长保护间隔（guard interval）后，每个符号都随之变长，最长一档连前导码也变长，所以同一级编码的速率有三个值；而在这个空口未被占满的房间里，这部分代价全部落在原本空闲的时间内，送达的字节数没有任何减少。',
  outcomes: [
    '把一次交互分为四段，并说出其中哪一段承载载荷（payload）',
    '说明确认帧（ACK）为什么值得占用那部分空口时间（airtime）',
    '说出确认帧的速率如何确定，以及它为什么不是一个固定值',
  ],
  needs: ['mcs-ladder', 'small-frames'],
  terms: [
    { term: 'ACK', plain: '确认帧：接收方立即回复的一个小帧，表示“这一帧已完整收到”' },
    { term: 'payload', plain: '帧中真正承载待发送数据的部分' },
  ],
  picture: [
    { heading: '网络真正分配的是时间', text: '一个房间里的空口就是一条信道，而一台无线电无法同时发送和接收。只要有一帧正在发送，能侦听到它的其他设备就都不能发送。所以无线网络真正分配的是空口上的时间：站点（STA）得到的不是一份带宽，而是一段可以独占的时间。下一段时间归谁，由媒体访问控制（MAC）——射频中决定何时发送的那一部分——决定。' },
    { kind: 'watch', jump: 0, heading: '测量一帧的时长', text: '载入仿真，跳到第一个数据帧（data frame）。把鼠标悬停在它上面：提示框会给出帧的大小、速率和精确时长。房间里其他设备需要等待的，就是这个时长。蓝色是接入点（AP）的泳道，绿色是站点的泳道。' },
    { heading: '只有中间一段随载荷变长', text: '讲字节数的那一课已经计算过：一帧的时长 = 固定的前导码（preamble）+ 整数个数据符号（symbol）。这个房间里的视频帧按那六步算出的时长是 125.6 µs，其中 44.0 µs 是前导码。载荷翻倍，符号数就翻倍；前导码保持不变。' },
    { heading: '而且一次交互要占用两段空口时间', text: '发送方无法检测碰撞：它发送时，自身的信号远强于其他一切信号。所以信道是否安静，对它来说不提供任何信息，只有接收方才能报告这一帧已完整到达。这份报告就是 ACK——只有十四个字节，在一段固定的短暂间隔之后返回。它很小，却始终不可省略；而且这段间隔加上 ACK，每一次交互都要计入。' },
    {
      kind: 'diagram', heading: '一次交互的时间分配（按比例绘制）', spec: exchangeTiming(),
      caption: '中间那段空白就是 16 µs 的间隔。169.6 µs 中，只有 81.6 µs 在传送载荷——其余 88.0 µs 是前导码、间隔和确认帧。一个只发送小帧的网络可以持续占用信道，却几乎传送不了多少数据；后面几乎每一种机制，都是为了把这些固定开销分摊到更多数据上。',
    },
    { heading: '保护间隔换来什么，以及这里为什么看不到', text: '保护间隔（guard interval）不是纯粹的开销，它在真实空口上有明确的作用：多径使同一个符号的延迟分量进入下一个符号，而每个符号前插入的那一小段正是用来吸收这些延迟分量的。标准在四处发送过程中各用一句话写明这一点，措辞相同——保护间隔按 TXVECTOR 的 GI_TYPE 插在每一个数据符号之前，用来对抗时延扩展（delay spread）：§19.3.20、§27.3.23、§32.3.13，以及 802.11be-2024 的 §36.3.22。而这四句就是全部：时延扩展这个词在 802.11-2024 的 5956 页中只出现在这一句话里。标准以三张表的形式给出了保护间隔的代价，却从未给它所对抗的对象任何数值。所以这里看不到它，不是我们省略了一个查得到的量——而是这一取舍只有一侧被公布过。因此这一课只讲已建模的那一侧：三档的符号、三档的这一帧、三列的速率，以及下面那一轮中没有减少任何字节的送达量。' },
  ],
  numbers: [
    { kind: 'table', heading: '这个房间里的一次交互', head: [
      '组成', '时长', '说明', '出处',
    ], rows: [
      ['数据帧的前导码', '44.0 µs', '固定值，与帧承载的内容无关', '§27.3.10'],
      ['6 个数据符号 × 13.6 µs', '81.6 µs', '那 1430 字节的载荷', '§27.3.10'],
      ['整个数据帧', '125.6 µs', '时间轴上那个色块表示的就是它', '§27.3.10'],
      ['应答之前的间隔', '16 µs', '每一次交互都一样', '§17.4.4'],
      ['ACK', '28 µs', '14 个字节，速率在 6、12、24 Mb/s 这三个强制速率里取不超过本帧参考速率的最高一个：这里是 24 Mb/s', '§17.4.3'],
      ['整次交互', '169.6 µs', '其中固定开销 88.0 µs，载荷 81.6 µs', '—'],
    ] },
    { kind: 'formula', heading: '时间的组成', text: '空口时间 = 前导码 + 符号时长 × ⌈载荷比特数 ÷ 每符号比特数⌉', note: '第一项始终不变；符号时长就是上表中的 13.6 µs。帧变大、编码变快，改变的只有第二项。' },
    { kind: 'table', heading: '同一帧，三个保护间隔', head: [
      '保护间隔', '一个符号', '这一帧（1430 B，六个符号）', '这一级的速率（Wi-Fi 6 第 11 级）',
    ], rows: giNumbers().map((r) => [
      `${r.giUs} µs（${r.name}${r.giUs === TGI_NS.quad / 1000 ? '，同时使用 4× LTF' : ''}）`,
      `${r.symUs} µs`,
      r.giUs === TGI_NS.quad / 1000 ? `${r.frameUs} µs（前导码也从 44.0 增加到 52.8 µs）` : `${r.frameUs} µs`,
      `${r.mbps} Mb/s`,
    ]) },
    { text: '数据来源：前两列出自 Table 27-13（符号时长就是 12.8 µs 的离散傅里叶变换周期加上所选的那一档保护间隔）；第三列由 txTimeModeNs 在 20 MHz、单流、单用户条件下分别计算；第四列是 Table 27-86 的三列速率栏，那一级就是调制与编码方式（modulation and coding scheme, MCS）11。这是本课最容易得到的一个结论：同一级编码的“速率”实际上有三个值。' },
    { kind: 'steps', heading: '应答帧的时长如何确定', items: [
      '数据帧的 125.6 µs 无需重新计算：讲字节数那一课的六步已经给出——1430 B，6 个符号，加 44.0 µs 的前导码。',
      '应答帧的速率不是固定值：取不超过数据帧自身参考速率的最高强制速率（mandatory rate）。标准把这条规则称为控制回应速率（control response rate）——在这条链路（link）上是 24 Mb/s，而不是数据帧使用的那一档。',
      '同样的算法用于 14 个字节：在 24 Mb/s 下是两个 4 µs 的符号，前面加一段 20 µs 的前导码，合计 28 µs。再加上它前面那 16 µs 的间隔，这次交互就完成了：125.6 + 16 + 28 = 169.6 µs。',
    ] },
  ],
  limits: [
    { kind: 'model-value', text: '44.0 µs 的前导码是写在 PHY_MODES 里的常数（src/engine/phy.ts），每一代一个值，不随空间流数与用户数增长，也不含 HE/EHT 的包扩展，所以这次交互中「固定开销 88.0 µs」这个数只在 20 MHz、单流、单用户时成立；真实 PPDU 的前导部分会随空间流数增加而逐段变长。而 44.0 µs 本身也只对应其中一档——即「2× LTF 加基本保护间隔」那一档，四倍保护间隔下它是 52.8 µs。13.6 µs 的符号则不是一个代表值：它是 Table 27-13 的 T_SYM1，也就是 12.8 µs 的离散傅里叶变换周期加 0.8 µs。' },
    { kind: 'unmodelled', text: '四倍保护间隔同时使用 4× LTF，因此前导码增加 8.8 µs（6.4 + 0.8 变为 12.8 + 3.2 µs），这部分时间代价已经建模——而它换来的收益没有建模：更长的训练字段带来的是更好的信道估计，而本引擎根本没有信道估计误差这个量，解调只比较一个信干噪比和一条门限。所以这 8.8 µs 在这里和长保护间隔本身一样，只有代价这一侧。' },
    { kind: 'unmodelled', text: '那 16 µs 的间隔在这里精确到纳秒：接收端固定在帧结束后一个 SIFS 把应答送到空口上（mac.ts 的 scheduleResponse 就是 t + sifsNs），本轮 116 个应答无一例外。真实的 SIFS 由收发切换、解调与 MAC 处理等几段时延组成，落在一个容差区间内，而射频自身的时钟也存在几十 ppm 的偏差。' },
    { kind: 'unmodelled', text: '这次交互中没有传播时延：帧在接收端同一纳秒开始、同一纳秒结束（channel.ts 的 applyPendingStarts 与 endTx）。所以 169.6 µs 是一个下限——真实的一次交互还要在两个方向上各加一次传播时间，以及接收端检测到信号开始所需的时间。' },
    { kind: 'out-of-scope', text: '「前 100 ms 里信道忙不到五分之一」只对这个房间成立：一个接入点、一台站点、一路视频，没有邻居网络、没有非 Wi-Fi 的能量、一次重传也没有。真实住宅的同一条信道上通常还有其他网络，同样一路视频测得的占用率会高得多，而且波动很大。' },
  ],
  sources: [
    '空口时间公式出自 IEEE Std 802.11-2024 的 §17.4.3（TXTIME）；44 µs 的高效率前导码是本仿真器为第 27 章 PPDU 取的单一代表值，并非逐个训练字段加出来的结果，而 13.6 µs 的符号不是代表值，见下一条。',
    '三个保护间隔取值与三个符号时长见 §27.3.9 Table 27-13 与 802.11be-2024 §36.3.10 Table 36-18（T_SYM = T_DFT + T_GI，12.8 µs 加 0.8／1.6／3.2 µs）；三列速率见 §27.5 Table 27-86 与 be §36.5.6 Table 36-76，那两张表的速率栏本来就是三列；GI_TYPE 由 TXVECTOR 指定见 §27.2 Table 27-1 与 be §36.2 Table 36-1；四倍保护间隔与 4× LTF 的配对见 §27.1.1、§26.7.5 与 be §36.1.1、§35.7.5；保护间隔用于对抗时延扩展见 §19.3.20、§27.3.23、§32.3.13 与 be §36.3.22，而那四处都没有给时延扩展任何数值。',
    '“发送方因为自己检测不到碰撞，所以把收不到 ACK 当作失败”这条规则见 §10.3.2.9。16 µs 的间隔是 aSIFSTime，见 §17.4.4。',
    '1430 字节的帧、产生它的视频业务模型，以及两台设备在房间里的位置，都是本仿真器对一路视频流的模型取值，标准正文里没有这些数字。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  // The whole cost of letting the reader run a round of their own: a label and one section.
  // Nothing else, so it contributes nothing to `mainPathChars`.
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
  observe: [
    '把鼠标悬停在 AP 泳道上任意一个蓝色数据块上：每一个都是 1430 字节、125.6 µs 的空口时间。色块在时间轴上的宽度，就是按比例绘制的这个时长。',
    '白色的应答帧在数据块结束后 16 µs 开始，持续 28 µs——略少于它所应答的那一帧的四分之一。',
    '两次交互之间泳道是空闲的。在前 100 ms 里，信道忙的时间不到五分之一，尽管这路视频流从未中断。',
    '切换到「四倍保护间隔（3.2 µs）」那个变体再运行一轮：送达的字节数完全相同——350 帧（175 个数据帧和它们的 175 个确认帧）、250 250 字节——而空口时间从 26.88 ms 增加到 30.94 ms。这个场景本来就没有占满空口，因此四倍保护间隔的代价全部落在原本空闲的时间内。',
  ],
  tryThis: [
    '动手计算一遍。拿 125.6 µs 的色块减去 44.0 µs 的前导码，再把剩下的除以 13.6 µs。结果应当恰好是六个符号。',
    '在编辑器里把电视改成 802.11a 再载入。载荷没变，但现在每个符号承载的比特少得多：同样一帧延长到 232 µs。',
  ],
  quiz: [
    {
      q: 'Wi-Fi 为什么非要有确认帧？',
      options: [
        '为了通知其他站点保持安静',
        '发送方自己检测不到碰撞，所以 ACK 是它唯一的送达凭据',
        '为了把接收方偏好的速率带回给发送方',
      ],
      answer: 1,
      explain: '无线电发送时无法接收，所以一帧发完后信道安静本身不能说明任何问题。只有返回的应答帧才能证明数据已经到达。',
    },
    {
      q: '两帧载荷相同，其中一帧用了更慢的编码。哪一帧占用信道的时间更长？',
      options: [
        '编码更快的那一帧',
        '编码更慢的那一帧',
        '一样长——空口时间只取决于字节数',
      ],
      answer: 1,
      explain: '每个符号承载的比特越少，同样的载荷就需要越多符号，而每个符号的时长相同。两种情况下前导码完全相同。',
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
  ],
}
