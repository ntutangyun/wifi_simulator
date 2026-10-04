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
  why: '一个房间，一条信道，同一时刻只能有一台设备在发。视频流、文件上传、手机收邮件，全都得共用同一片空气，一帧接着一帧。所以真正值得数的不是字节，而是时间：一次收发交互把信道占住多久，其中又有多少根本没在搬运谁想要的东西。这一课就把一次交互的时间逐段量出来。',
  outcomes: [
    '把一次交互拆成四段，并说出其中哪一段才是载荷（payload）',
    '说清确认帧（ACK）为什么值得它占掉的那点空口时间（airtime）',
    '说出确认帧的速率是怎么定下来的，以及它为什么不是一个固定值',
  ],
  needs: ['mcs-ladder', 'small-frames'],
  terms: [
    { term: 'ACK', plain: '确认帧：接收方立刻回发的一个小帧，意思是“这帧我完整收到了”' },
    { term: 'payload', plain: '帧里真正装着“要发的东西”的那一段' },
  ],
  picture: [
    { heading: '这张网真正要分配的是时间', text: '一个房间里的空气就是一条信道，而一台无线电没法一边发送一边接收。只要有一帧正在发出去，能侦听到它的其他设备就都不能发送。所以无线网络真正在分配的是空口上的时间：站点（STA）得到的不是一份带宽，而是一段可以独占的时间。下一段归谁，由媒体访问控制（MAC）——射频里决定什么时候发送的那一部分——定下来。' },
    { kind: 'watch', jump: 0, heading: '给一帧计一次时', text: '载入仿真，跳到第一个数据帧（data frame）。把鼠标悬在它上面：提示框会给出帧的大小、速率和精确时长。房间里其他设备要等的，就是这个时长。蓝色是接入点（AP）的泳道，绿色是站点的。' },
    { heading: '会变长的只有中间那段', text: '讲字节数的那一课已经把这件事算过：一帧的时长 = 固定的前导码（preamble）+ 整数个数据符号（symbol）。这个房间里的视频帧走完那六步是 125.6 µs，其中 44.0 µs 是前导码。载荷翻倍，符号数就翻倍；前导码一动不动。' },
    { heading: '而且一次交互要占掉两段空口时间', text: '发送方检测不到碰撞：它发的时候，自己的信号盖住了一切。所以安静对它毫无信息量，只有接收方才能报告这一帧完整到达。这份报告就是 ACK——只有十四个字节，在一段固定的短暂停顿之后回过来。它很小，却永远不是可选项；而且这段停顿加上 ACK，每一次交互都要算进去。' },
    {
      kind: 'diagram', heading: '一次交互，按比例画', spec: exchangeTiming(),
      caption: '中间那道空白就是 16 µs 的停顿。169.6 µs 里，只有 81.6 µs 在搬运载荷——其余 88.0 µs 是前导码、停顿和确认。一个只发小帧的网络可以一直占着信道，却几乎没搬动多少数据，后面几乎每一种机制都是把这些固定开销摊到更多数据上去。',
    },
    { heading: '它换的是什么，而这里为什么看不见', text: '保护间隔（guard interval）不是纯粹的开销，它在真实空口上有一件明确的工作：多径让同一个符号的回声落进下一个符号里，而每个符号前面插的那一小段就是用来把回声挡在外面的。标准把这件事写在四处发送过程里，各一句，用词都一样——保护间隔按 TXVECTOR 的 GI_TYPE 插在每一个数据符号之前，用来对抗时延扩展（delay spread）：§19.3.20、§27.3.23、§32.3.13，以及 802.11be-2024 的 §36.3.22。而这四句就是全部：时延扩展这个词在 802.11-2024 的 5956 页里只出现在那一句话上。标准把保护间隔的代价发布成三张表，却从不给它对抗的那样东西一个数。所以这里看不见它，不是我们省略了一个查得到的量——是这笔交易只有一侧被发布过。于是这一课只讲建出来的那一侧：三档的符号、三档的这一帧、三列的速率，以及下面那一轮里一个字节都没少的送达量。' },
  ],
  numbers: [
    { kind: 'table', heading: '这个房间里的一次交互', head: [
      '组成', '时长', '这是什么', '出处',
    ], rows: [
      ['数据帧的前导码', '44.0 µs', '固定值，与帧里装了什么无关', '§27.3.10'],
      ['6 个数据符号 × 13.6 µs', '81.6 µs', '那 1430 字节的载荷', '§27.3.10'],
      ['整个数据帧', '125.6 µs', '时间轴上那个色块量的就是它', '§27.3.10'],
      ['回答之前的停顿', '16 µs', '每一次交互都一样', '§17.4.4'],
      ['ACK', '28 µs', '14 个字节，速率在 6、12、24 Mb/s 这三个强制速率里取不超过本帧参考速率的最高一个：这里是 24 Mb/s', '§17.4.3'],
      ['整次交互', '169.6 µs', '其中固定开销 88.0 µs，载荷 81.6 µs', '—'],
    ] },
    { kind: 'formula', heading: '时间花在哪儿', text: '空口时间 = 前导码 + 符号时长 × ⌈载荷比特数 ÷ 每符号比特数⌉', note: '第一项永远不动；符号时长就是上表里那 13.6 µs。帧变大、编码变快，能改的只有第二项。' },
    { kind: 'table', heading: '同一帧，三个保护间隔', head: [
      '保护间隔', '一个符号', '这一帧（1430 B，六个符号）', '这一级的速率（Wi-Fi 6 第 11 级）',
    ], rows: giNumbers().map((r) => [
      `${r.giUs} µs（${r.name}${r.giUs === TGI_NS.quad / 1000 ? '，连 4× LTF' : ''}）`,
      `${r.symUs} µs`,
      r.giUs === TGI_NS.quad / 1000 ? `${r.frameUs} µs（前导码也从 44.0 变 52.8 µs）` : `${r.frameUs} µs`,
      `${r.mbps} Mb/s`,
    ]) },
    { text: '量具：前两列出自 Table 27-13（符号时长就是 12.8 µs 的离散傅里叶变换周期加上选中的那一段）；第三列是 txTimeModeNs 在 20 MHz、单流、单用户下各算一次；第四列是 Table 27-86 的三列速率栏，那一级就是调制与编码方式（modulation and coding scheme, MCS）11。这是这一课最便宜的一个收获：速率这个词原来有三个值。' },
    { kind: 'steps', heading: '那个回答的时长是怎么定下来的', items: [
      '数据帧的 125.6 µs 不必再算一遍：讲字节数那一课的六步已经给出了它——1430 B，6 个符号，加 44.0 µs 的前导码。',
      '回答的速率并不是一个定值：取不超过数据帧自身参考速率的那个最高强制速率（mandatory rate）。标准把这条规则叫作控制回应速率（control response rate）——在这条链路（link）上是 24 Mb/s，而不是数据帧的那一档。',
      '同一套算术用在 14 个字节上：在 24 Mb/s 下是两个 4 µs 的符号，前面挂一段 20 µs 的前导码，合计 28 µs。再补上它前面那 16 µs 的停顿，这次交互就走完了：125.6 + 16 + 28 = 169.6 µs。',
    ] },
  ],
  limits: [
    { kind: 'model-value', text: '44.0 µs 的前导码是写在 PHY_MODES 里的常数（src/engine/phy.ts），一代一个值，不随空间流数与用户数增长，也不含 HE/EHT 的包扩展，所以这次交互里「固定开销 88.0 µs」这个数只在 20 MHz、单流、单用户时成立；真实 PPDU 的前端会随流数逐段加长。而 44.0 µs 本身还是一档——它是「2× LTF 加基本保护间隔」那一档，四倍保护间隔下它是 52.8 µs。13.6 µs 的符号则不是一个代表值：它是 Table 27-13 的 T_SYM1，也就是 12.8 µs 的离散傅里叶变换周期加 0.8 µs。' },
    { kind: 'unmodelled', text: '四倍保护间隔连着 4× LTF，于是前导码多 8.8 µs（6.4 + 0.8 变成 12.8 + 3.2 µs），这笔时间代价建了进来——而它换的那样东西没建：更长的训练字段买的是更好的信道估计，而这个引擎根本没有信道估计误差这个量，解调只比一个信干噪比和一条门限。所以这 8.8 µs 在这里和长保护间隔本身一样，只有代价这一侧。' },
    { kind: 'unmodelled', text: '那 16 µs 的停顿在这里精确到纳秒：接收端固定在帧结束后一个 SIFS 把回答送上空口（mac.ts 的 scheduleResponse 就是 t + sifsNs），本轮 254 个回答一个不差。真实的 SIFS 是收发切换、解调与 MAC 处理几段时延加起来的，落在一个容差区间里，而射频自己的时钟也带着几十 ppm 的偏差。' },
    { kind: 'unmodelled', text: '这次交互里没有传播时延：帧在接收端同一纳秒开始、同一纳秒结束（channel.ts 的 applyPendingStarts 与 endTx）。所以 169.6 µs 是一个下限——真实的一次交互还要在两个方向上各加一次飞行时间，以及接收端察觉信号开始所需的那段时间。' },
    { kind: 'out-of-scope', text: '「前 100 ms 里信道忙不到五分之一」只对这个房间成立：一个接入点、一台站点、一路视频，没有邻居网络、没有非 Wi-Fi 的能量、一次重传也没有。真实住宅的同一条信道上通常还躺着别人的网络，同样一路视频测出来的占用率会高得多，而且高得不稳定。' },
  ],
  sources: [
    '空口时间公式出自 IEEE Std 802.11-2024 的 §17.4.3（TXTIME）；44 µs 的高效率前导码是本仿真器为第 27 章 PPDU 取的单一代表值，并非逐个训练字段加出来的结果，而 13.6 µs 的符号不是代表值，见下一条。',
    '三个保护间隔取值与三个符号时长见 §27.3.9 Table 27-13 与 802.11be-2024 §36.3.10 Table 36-18（T_SYM = T_DFT + T_GI，12.8 µs 加 0.8／1.6／3.2 µs）；三列速率见 §27.5 Table 27-86 与 be §36.5.6 Table 36-76，那两张表的速率栏本来就是三列；GI_TYPE 由 TXVECTOR 指定见 §27.2 Table 27-1 与 be §36.2 Table 36-1；四倍保护间隔与 4× LTF 的配对见 §27.1.1、§26.7.5 与 be §36.1.1、§35.7.5；保护间隔用于对抗时延扩展见 §19.3.20、§27.3.23、§32.3.13 与 be §36.3.22，而那四处都没有给时延扩展任何数值。',
    '“发送方因为自己检测不到碰撞，所以把收不到 ACK 当作失败”这条规则见 §10.3.2.9。16 µs 的停顿是 aSIFSTime，见 §17.4.4。',
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
    '把鼠标悬到 AP 泳道上任意一个蓝色数据块：每一个都是 1430 字节、125.6 µs 的空口时间。色块在时间轴上的宽度，就是按比例画出的这个时长。',
    '白色的回答在数据块结束后 16 µs 开始，持续 28 µs——比它所回答的那一帧的四分之一略少一点。',
    '两次交互之间泳道是空的。在前 100 ms 里，信道忙的时间不到五分之一，尽管这路视频流一刻也没停。',
    '换到「四倍保护间隔（3.2 µs）」那个变体再跑一轮：送到的字节一个都不差——350 帧（175 个数据帧和它们的 175 个确认帧）、250 250 字节——而空口时间从 26.88 ms 涨到 30.94 ms。这个场景本来就没把空口占满，于是四倍保护间隔的代价全部落进了原本空着的那段时间里。',
  ],
  tryThis: [
    '把算术做一遍。拿 125.6 µs 的色块减去 44.0 µs 的前导码，再把剩下的除以 13.6 µs。你应该刚好得到六个符号。',
    '在编辑器里把电视改成 802.11a 再载入。载荷没变，但现在每个符号装的比特少得多：同样一帧拉长到了 232 µs。',
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
      explain: '无线电发送时无法接收，所以一帧发完后的安静本身什么也说明不了。只有回过来的那一帧才说明数据到了。',
    },
    {
      q: '两帧载荷相同，其中一帧用了更慢的编码。哪一帧占住信道更久？',
      options: [
        '编码更快的那一帧',
        '编码更慢的那一帧',
        '一样久——空口时间只取决于字节数',
      ],
      answer: 1,
      explain: '每符号装的比特越少，同样的载荷就要用越多符号，而每个符号都一样长。两种情况下前导码完全相同。',
    },
    {
      q: '把这一帧的载荷减半，那 169.6 µs 的交互会怎样？',
      options: [
        '也跟着减半',
        '减少 40.8 µs——正好是用不上的那三个符号',
        '完全不变',
      ],
      answer: 1,
      explain: '减少的只有符号数，从六个变成三个。前导码、停顿和回答都没变，所以整次交互落在 128.8 µs。',
    },
  ],
}
