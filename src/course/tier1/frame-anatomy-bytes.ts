/**
 * Wi-Fi Tier 1 - M3 - lesson 3: what the radio puts in front of every frame,
 * and the arithmetic that turns a byte count into microseconds.
 *
 * The second half of the old `frame-anatomy`, and after the re-pacing of
 * 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M3, §4, §5.1 item 1 and §5.4) the SOLE owner of that arithmetic: the
 * same six steps used to be taught again, in full, in `airtime`, which now
 * keeps only the answer's own rate and the pause and cites the result.
 *
 * The cost of a small frame and what one preamble buys a burst of fourteen are
 * `small-frames`, which loads this lesson's own scene — the same builder that
 * `frame-anatomy` loads, no variant — so the split adds no scenario and the
 * recorded hash is the same run three times.
 *
 * §4 gives this lesson a `timing` figure, and it replaces prose: the
 * per-generation table is gone, and the figure draws the two frames the run
 * itself puts on the air, a fixed front and the symbols that stretch behind it.
 *
 * How the newer preambles grow is in `deeper`; the clause numbers and the model
 * choices are in `sources`.
 *
 * Every number quoted below is pinned in tests/course/frame-anatomy-bytes.test.ts.
 */
import { PHY_MODES, TGI_NS, txTimeModeNs } from '../../engine/phy'
import type { Ns } from '../../model/types'
import type { TimingSpec } from '../diagram'
import { J, type Lesson } from '../lessonKit'
import { frameAnatomyScenario, firstLegacyData, firstQosSingle } from './frame-anatomy'

/** The two frames the figure draws, in microseconds: both are measured in the run. */
export const LEGACY_FRAME_US = 248
export const HE_FRAME_US = 57.6

/**
 * The phone's own 230-byte Wi-Fi 6 frame, repriced at a guard interval (µs).
 *
 * Pure arithmetic on the frame this lesson already prints — no run and no randomness — so the
 * two percentages in `limits` below are computed rather than typed (the `echoFacts` rule). The
 * quadruple tier carries the 4x LTF with it, so its preamble is 52.8 µs rather than 44.
 */
const giFrameUs = (giNs: Ns): number => txTimeModeNs('he', 230, 11, { widthMhz: 20, giNs }) / 1000

/** How much more that frame costs at `giNs` than at the base guard interval, as a percentage. */
const giCostPct = (giNs: Ns): string =>
  ((giFrameUs(giNs) / giFrameUs(TGI_NS.base) - 1) * 100).toFixed(2)

/**
 * The same two blocks the timeline shows, drawn to scale against each other:
 * the old laptop's 1528 B frame at 802.11a, and the phone's 230 B frame at
 * Wi-Fi 6. Every duration comes from `PHY_MODES` or from the run, and the test
 * reads each one back out of this spec, so the picture cannot drift.
 */
export function preambleTiming(): TimingSpec {
  const a = PHY_MODES.nonht
  const he = PHY_MODES.he
  const us = (ns: number): number => ns / 1000
  return {
    kind: 'timing',
    lanes: [
      { label: '802.11a', spans: [
        { label: '前导码', fromUs: 0, toUs: us(a.preambleNs) },
        { label: `57 个符号 × ${us(a.symNs)} µs`, fromUs: us(a.preambleNs), toUs: LEGACY_FRAME_US, tone: 'accent' },
      ] },
      { label: 'Wi-Fi 6', spans: [
        { label: '前导码', fromUs: 0, toUs: us(he.preambleNs) },
        { label: '1 个符号', fromUs: us(he.preambleNs), toUs: HE_FRAME_US, tone: 'accent' },
      ] },
    ],
    axis: { fromUs: 0, toUs: LEGACY_FRAME_US, ticks: [0, 50, 100, 150, 200, 248], unit: 'µs' },
  }
}

export const frameAnatomyBytes: Lesson = {
  id: 'frame-anatomy-bytes',
  module: 2,
  title: '一帧在空口上占用多长时间',
  why: '前面两课逐一介绍了一帧的各个字段。但这些字段都有代价：数据前面每多一个字节，就多占用一段其他设备无法使用的空口时间（airtime）；而在这一帧本身之前，射频还要发送更长的一段信号——前导码（preamble）。前导码开头的三段，历代标准都原样保留：先是一小段重复的信号，让接收端检测到有信号开始；再是一段更长的已知信号，用来估计信道对信号造成的变化；最后一个字段以最低速率指明后面部分的速率和长度，因此无法解码这一帧的邻居和旧设备，也能知道空口何时重新空闲。这是防止邻居之间重叠发送的唯一机制，所以 Wi-Fi 7 也只在这三段之后添加新字段。帧本身的字节数很容易计算：帧头（MAC header）、载荷（payload），再加上校验。但空口时间不按字节计算，而按整数个符号（symbol）计算：字节换算成比特，除以一个符号能承载的比特数，向上取整，再加上前导码。所以业务标记使帧头增加的那两个字节，常常正好落入最后一个符号本来就有的空余位置，不增加任何时间；而一个很小的应答帧，空口时间几乎全部用在前导码上。',
  outcomes: [
    '说出射频在每一帧前面发送的几段信号是什么，以及每一段的作用',
    '由载荷（payload）、帧头（MAC header）和校验算出一帧的字节数',
    '把字节数逐步换算成微秒，并说出向上取整发生在哪一步',
    '解释为什么帧头多两个字节，空口时间却可能完全不增加',
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'L-STF', plain: '任何一帧最前面的一小段：一串简单的重复信号，用来让接收端检测到“有信号开始了”' },
    { term: 'L-LTF', plain: '紧随其后的一段，长度足以让接收端在任何数据比特到来之前先完成信道估计' },
    { term: 'L-SIG', plain: '历代所有 Wi-Fi 射频都能读懂的字段：指明这一帧其余部分的速率和长度' },
    { term: 'preamble', plain: '前导码：每一帧前面那段固定的已知信号——就是上面这三个字段，加上新一代标准在它们后面添加的字段' },
    { term: 'U-SIG', plain: 'Wi-Fi 7 在那三段之后增加的一个字段，说明后面采用的是哪种新格式' },
  ],
  picture: [
    { heading: '所有设备都能读懂的部分', text: '接收端无法从帧的中间开始接收。在帧的任何部分之前，射频先发出一小段重复的信号，也就是 L-STF（legacy short training field），它唯一的任务是被检测到：有信号开始了，比特定时就从这里对齐。接着是一段更长的已知信号，也就是 L-LTF（legacy long training field），接收端用它来估计这条信道——信号在传播途中经墙体等发生了怎样的变化——以便在数据比特到达时补偿这一变化。' },
    { heading: '再用一个字段指明长度', text: '这时接收端已经锁定了信号，但对后面的内容仍一无所知。接下来的字段就是 L-SIG（legacy signal field），它只告诉接收端两件事：后面部分采用的编码速率，以及总长度。这足以让一台根本无法解码这一帧的射频——邻居的设备，或者更旧的设备——知道空口何时会重新空闲。历代标准都原样发送它，并且使用最低的速率。这三段合起来，就是前导码。' },
    { kind: 'watch', jump: 0, heading: '对比两帧的前导码', text: '载入仿真，先跳到旧笔记本的第一帧，再跳到手机的那一帧，各自展开“空中字段”。两个色块都分为“前导码”和“数据部分”两段；比较各自的前导码所占的比例。' },
    { heading: '新一代射频仍沿用传统前导码', text: 'Wi-Fi 7 的帧本可以采用更适合自己的开头，但它没有这样做。它的前导码仍然是那三段，以便楼里每一台设备都能读出它的长度；之后才加上一个新字段，也就是 U-SIG（universal signal field），说明后面采用的是哪种新格式。这里的向后兼容不是可有可无的附加功能，而是防止邻居之间重叠发送的唯一机制。' },
    { heading: '计算字节数', text: '帧本身的字节数很容易计算：帧头，加上载荷，再加上校验。帧头长度固定，而业务类别标记会使它增加两个字节。但空口时间不按字节计算，而按整数个符号（symbol）计算：一帧要向上补齐到整数个符号，因此多出的那两个字节，常常正好落入最后一个符号本来就有的空余位置。' },
    {
      kind: 'diagram', heading: '两帧，按同一时间刻度绘制', spec: preambleTiming(),
      caption: '上面是旧笔记本 1528 B 的一帧：20 µs 的前导码，后面 57 个符号。下面是手机 230 B 的一帧：前导码 44 µs，后面只有一个符号。前导码的长度与承载的内容无关——换一代标准只改变两个尺寸：前导码 20 → 40 → 44 → 48 µs，符号 4 → 4 → 13.6 → 13.6 µs（多设备共享的帧再多 4 µs）。',
    },
  ],
  numbers: [
    { kind: 'formula', heading: '一个传统帧占用多长时间', text: 'TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉ µs', note: 'N_DBPS 是一个符号能承载的数据比特数：54 Mb/s 时是 216，24 Mb/s 时是 96。这个向上取整就是补齐——空口时间按整数个符号计算。' },
    { kind: 'formula', heading: '计算一帧的字节数', text: '24 + 1500 + 4 = 1528 B      ·      带标记时 26 + 1500 + 4 = 1530 B', note: '多出的那两个字节没有多占用一个符号，所以在这里不增加空口时间。' },
    { kind: 'steps', heading: '从字节到微秒的计算步骤', items: [
      '先计算这一帧的字节数：帧头、上层交下来的载荷，再加四个字节的校验——旧笔记本这一帧是 24 + 1500 + 4 = 1528 B。',
      '把这些字节换算成比特，再加上射频放在它们前面的服务字段（SERVICE field）和后面的尾比特（tail bits）：16 + 8 × 1528 + 6 个比特。',
      '除以当前速率下一个符号能承载的比特数——54 Mb/s 时是 216——然后向上取整，因为未填满的符号也要完整发送：57 个符号。',
      '先计入这一代标准必须发送的前导码，再计入符号：20 µs，加上 57 × 4 µs，一共 248 µs 空口时间。',
      '更新一代的射频只改变这两个尺寸：前导码变为 44 或 48 µs，符号变为 13.6 µs，而一个符号能承载的比特数多得多。',
      '再加上业务标记重做第 1 步：1530 B；到第 3 步，向上取整得到的仍是 57 个符号。这就是两个字节可能完全不增加空口时间的原因。',
    ] },
    { kind: 'table', heading: '旧笔记本第一帧的计算过程', head: [
      '步骤', '数值',
    ], rows: [
      ['这一帧的字节', '24 + 1500 + 4 = 1528 B'],
      ['要发的比特', '16 + 8 × 1528 + 6 = 12 246'],
      ['54 Mb/s 下一个符号的比特', '216'],
      ['向上取整后的符号数', '57'],
      ['前导码加符号', '20 + 57 × 4 µs'],
      ['因此这一帧占用的空口时间', '248 µs'],
    ] },
    { heading: '一个小帧占用多少时间', text: '同样的算法用于一个 14 B 的应答帧：它在 24 Mb/s 下只占两个符号，一共 28 µs 空口时间——其中 20 µs 是前导码。小帧的开销几乎全部在前导码上，这正是下一课的主题。' },
  ],
  deeper: [
    { heading: '空口时长公式的来源', text: '那 16 µs 是 L-STF 加 L-LTF，4 µs 是 L-SIG；其后的数据符号中包含 16 比特的 SERVICE 字段、PSDU、6 个尾比特，以及补齐到整符号的填充——取整式里的 16 和 6 就是它们。54 Mb/s 下，1528 B 的一帧需要 ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57 个符号，20 + 57 × 4 = 248 µs。' },
    { heading: '为什么更新的前导码只是代表值', text: '上面的 40、44、48 µs 是 20 MHz、单空间流下的单用户取值。真实的 VHT、HE 或 EHT 前导码会随空间流数增长——每条流都要有自己的训练字段——也会随多用户帧所服务的用户数增长，多出的那 4 µs HE-SIG-B 或 EHT-SIG 正是为此而增加的。仿真器没有建模这种增长，每一代只给一个代表值。' },
  ],
  limits: [
    { kind: 'model-value', text: '1530 里只有两个数是标准的：26 字节的 QoS 数据帧头（24 加两字节 QoS Control）与 4 字节的 FCS。中间的 1500 是本仿真器自己设定的——它是以太网的 MTU，也就是业务发生器产生的载荷大小，标准对它没有任何规定。换一个业务模型，这个数就会改变。' },
    { kind: 'out-of-scope', text: '1530 不是一个 MPDU 的上限，与上限相差很远。IEEE Std 802.11-2024 的 Table 9-34 给出 MSDU 最大 2304 字节，A-MSDU 最大 3839、4065 或 7935 字节；而 dot11MaxMPDULength 给 VHT 的三个档位是 3895、7991、11454 字节。本课每一帧都是 1530，只是因为载荷被设定为 1500，而不是因为更大的帧无法容纳。' },
    { kind: 'unmodelled', text: '载荷前面没有 LLC/SNAP：真实的 802.11 承载 IP 时要先加上 8 个八位组（第五课《一个网络中的角色》的深入部分提到过它），所以 1500 字节的 IP 包其实是 1508 字节的 MSDU，整帧应该是 26 + 1508 + 4 = 1538 字节。本引擎直接把载荷作为 MSDU，这 8 字节始终不存在。' },
    { kind: 'model-value', text: '40、44、48 µs 的前导码是写在 PHY_MODES 里的常数（src/engine/phy.ts），每一代一个代表值：它们不随空间流数增长，不随多用户帧的用户数增长，HE 与 EHT 的包扩展（packet extension）完全不计入，而真实的 VHT/HE/EHT 前导码每多一条流就多一个训练字段，所以本课那两个尺寸只在 20 MHz、单流、单用户时才准确。而 13.6 µs 的符号不是一个代表值——它是 §27.3.9 Table 27-13 的 T_SYM1，也就是 12.8 µs 的离散傅里叶变换周期加上 0.8 µs 的基本保护间隔，既有表格依据，也有求和公式（engine/phy.ts 的 symNsFor 把这个和拆开写了出来）。' },
    { kind: 'model-value', text: '保护间隔（guard interval）在引擎中是一个场景常量：选用哪一档由场景编写者决定（scenario.ts 的 guardInterval 一节），引擎不会代为选择（engine/mac.ts 的 WifiMacCfg.giNs 没有按链路或按对端的入参）。而标准也不规定选择规则——它只规定存在哪三档（0.8、1.6、3.2 µs）、各档的符号时长，以及这一档由 TXVECTOR 的 GI_TYPE 指定（§27.2 Table 27-1 / §27.3.9 Table 27-13）。本课六步计算使用的是基本档。' },
    { kind: 'unmodelled', text: `标准在四处发送过程里各说一句，保护间隔用来对抗时延扩展（delay spread，§19.3.20 / §27.3.23 / §32.3.13 / 802.11be-2024 §36.3.22），而那四处都没有给出任何数值，本引擎也不建模时延扩展：解调门限 reqSinrDb(mode, mcs) 的入参里根本没有时间这一项。所以在这里较长的保护间隔只有代价：手机这一帧 230 字节，三档下分别是 ${giFrameUs(TGI_NS.base)}、${giFrameUs(TGI_NS.double)} 与 ${giFrameUs(TGI_NS.quad)} µs，也就是增加 ${giCostPct(TGI_NS.double)} % 与 ${giCostPct(TGI_NS.quad)} %（四倍档同时使用 4× LTF，前导码从 44 增加到 52.8 µs）。真实设备付出这部分时间，换来的是多径环境下的稳健性，而这一收益在本引擎中没有任何体现。`, },
    { kind: 'unmodelled', text: '空口时间里没有传播时延：一帧在所有接收端同一纳秒开始、同一纳秒结束（channel.ts 的 applyPendingStarts 与 endTx 都取发送端的那个时刻）。真实环境中 10 m 的距离需要传播 33 ns，而时隙之所以必须长达 9 µs，一半的原因正是要覆盖这段时延以及检测信号所需的时间。' },
    { kind: 'out-of-scope', text: '这六步只覆盖单用户、占满整条信道的 PPDU。多设备共享的帧在引擎中按 ruFraction 缩放每符号比特数、按空间流数成倍增加（txTimeModeNs），这是一种理想的线性换算。真实的资源单元有各自的音调数与导频开销，划分得越细，每份能承载的比特数就比按比例算出的更少。' },
  ],
  sources: [
    '非 HT 前导码与空口时长公式见 IEEE Std 802.11-2024 §17.3.2 与 §17.4.3；L-STF、L-LTF、L-SIG 这几个名字也出自第 17 章。20 µs 的前导码与 4 µs 的符号是标准里的数值，不是模型取值。',
    '40、44、48 µs 的前导码与 13.6 µs 的符号，是本仿真器在 20 MHz、单流下的代表性单用户取值；真实值会随空间流数与用户数增长（第 21、27、36 章）。Wi-Fi 7 帧里跟在传统字段之后的 U-SIG 见 §36.3.12。',
    '控制帧的大小见 §9.3.1。上面每一个时长和字节数，都是在本课场景中实测得到的。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个传统数据帧', firstLegacyData),
    J('第一个 QoS 数据帧', firstQosSingle),
  ],
  observe: [
    '对比这两帧。旧笔记本那一帧是 16 µs 的 L-STF 与 L-LTF、加 4 µs 的 L-SIG，之后才是 57 个数据符号；手机那一帧（Wi-Fi 6）是 44 µs 的前导码加一个 13.6 µs 的符号——几乎全是前导码。',
    '两帧的帧头相差两个字节，色块却都结束在整数个符号的边界上：旧笔记本那一帧 248 µs，有没有那两个字节都一样。',
  ],
  tryThis: [
    '用手机那一帧按六步计算一遍：230 B → 16 + 8 × 230 + 6 = 1862 比特 → 除以 1950（Wi-Fi 6 在这一级上一个符号承载的比特数）向上取整得 1 个符号 → 44 + 1 × 13.6 = 57.6 µs。把指针悬停在那个色块上，读数就是 57.6 µs。',
    '在编辑器里把旧笔记本改成 Wi-Fi 5 再载入。它的前导码从 20 µs 变成 40 µs，符号仍是 4 µs：换一代标准改变的就是这两个尺寸。',
  ],
  quiz: [
    {
      q: '为什么一帧 Wi-Fi 7 的帧，开头用的仍是 1999 年设计的字段？',
      options: [
        '因为新字段无法放在最前面',
        '这样附近任何一台射频，无论多旧，都能读出空口将被占用多久',
        '因为 L-SIG 里装着地址',
      ],
      answer: 1,
      explain: '无法解码这一帧的设备，仍然能读懂 L-SIG，并在相应的时间内保持静默。',
    },
    {
      q: '业务标记使帧头增加了两个字节，但这一帧的空口时间没有变化。为什么？',
      options: [
        '标记放在前导码中发送，而前导码长度固定',
        '空口时间按整数个符号计算，而最后那个符号本来就有空余位置',
        '校验会相应缩短两个字节，留出位置',
      ],
      answer: 1,
      explain: '两者都向上补齐到 57 个符号，都是 248 µs。只有当那两个字节使帧延伸到下一个符号时，才会增加时间。',
    },
    {
      q: '把载荷从 1500 B 减到 1400 B，旧笔记本这一帧的空口时间会怎样？',
      options: [
        '按比例缩短：少 6.7 % 的字节，就少 6.7 % 的时间',
        '减少几个完整的符号——只有跨过符号边界才会改变时长',
        '完全不变：前导码是固定的',
      ],
      answer: 1,
      explain: '空口时间按整数个符号计算。少 100 B 就是少 800 比特，54 Mb/s 下一个符号承载 216 比特，因此少 4 个符号、16 µs；前导码的 20 µs 保持不变。',
    },
  ],
}
