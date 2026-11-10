/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · what a member's own resource unit costs it
 * in frequency diversity.
 *
 * The lesson of slice 4b (docs/superpowers/specs/2026-10-04-ru-diversity-design.md §7.2,
 * §7.5). It sits immediately after `ofdma-dl`, because `ofdma-dl`'s own `limits` entry is its
 * subject: a member used to be credited with the whole channel's bins, and now reads only the
 * bins inside its own share.
 *
 * **Why it is a lesson of its own and not a paragraph in `ofdma-dl`** (design §7.1, all three
 * reasons measured): `ofdma-dl` and `selectivity` were both already long lessons, and
 * — the reason that matters —
 * **`ofdma-dl`'s own scene cannot show this effect at all.** That scene's margin is 15.4 dB,
 * where neither leg of this lesson's comparison loses a frame, so a reader would have read a
 * paragraph about something their own screen does not do.
 *
 * **Every figure printed below is measured on this lesson's own scene** and pinned in
 * tests/course/ru-diversity.test.ts. The instrument is stated at each one, because this branch
 * has already published a number that was nothing but the sampling error of one unrecorded run
 * (design §3.2.1), and because two of the figures the design doc offered for this lesson
 * (「九格 2.31 dB、四格 2.20 dB」, 「p90 从 4.70 涨到 5.85」) belong to `ofdma-dl`'s scene and
 * are false here — this scene's own pair is 2.17 → 1.80 dB median and 4.44 → 5.42 dB at p90.
 *
 * Four sentences this text may not write, each one a finding of this slice:
 *  - **no 「相差 0.02 dB」 about position** (design §3.2.1). The true spread between the six
 *    four-bin windows of a nine-bin channel is *exactly* zero, so every number a run reports
 *    is Monte-Carlo noise: 0.021 dB at 20 000 draws, 0.030 at 50 000, 0.007 at 100 000 — not
 *    even monotone. The lesson states the claim and the reason, never the artifact;
 *  - **no 「那一格」 without its bandwidth** (design §2.3's 2026-10-04 correction). 20 MHz with
 *    two members loses one bin, the middle 26-tone RU; 40 MHz with four members loses **two**
 *    (RU 5 and RU 14) and has no middle bin at all, 18 being even;
 *  - **no measurement claimed for the 1/3 and 1/4 shares.** `buildMuParts` skips a member whose
 *    head MSDU does not fit the PPDU duration cap, and at MCS 0 a narrower resource unit makes
 *    that airtime longer — so this scene cannot build a three-member group, and the chain past
 *    1/2 is a model. Only the chain itself is stated (design §7.3.1 (d));
 *  - **no uplink figure.** The share reaches the uplink now, but the loop that would set a
 *    triggered response's rate has never closed (`rate.ts`'s own header), so an uplink margin
 *    is not under rate control at all. It is a `limits` entry, with the one uplink figure this
 *    lesson does print — `ofdma-ul`'s own +12.195 dB and zero losses — measured here.
 *
 * `limits`, `deeper` and `sources` are not part of the main path a reader walks, which is why
 * Task 6 of this slice put all four of its additions there — two new `limits` entries (design
 * §10.1's rate-selection asymmetry, which §10.1 names as owed to this lesson, and §10.2's
 * capacity direction), the split of the inter-bin entry's direction, and the clause attributions.
 *
 * The bin counts come from `engine/selectivity.ts` rather than being typed, for the reason that
 * module gives: they are the standard's own arithmetic, and a literal here could drift out of
 * agreement with the engine the lesson describes.
 */
import { selBins, selBinWidthMhz, selMemberBins } from '../../engine/selectivity'
import { type Lesson, J, firstMuDl } from '../lessonKit'
import { ruDiversityScenario } from '../wifiScenes'

/** The (bandwidth, member count) pairs the share table walks, narrowest first. */
export const SHARE_CASES: readonly (readonly [20 | 40, 2 | 3 | 4])[] = [
  [20, 2], [20, 3], [20, 4], [40, 2], [40, 3], [40, 4],
]

/**
 * Which bins nobody holds, per row of that table — the one column that is not arithmetic.
 *
 * It is keyed by `selBins(w) - n * selMemberBins(w, 1 / n)`, so a row can only say "one bin" or
 * "two bins" when the engine's own functions leave that many over. The clause after it is the
 * standard's own name for them, and it is deliberately different per bandwidth: 20 MHz has a
 * middle 26-tone RU (Table 27-8 NOTE 2) and 40 MHz does not, 18 being even.
 */
const LEFTOVER: Record<string, string> = {
  '20|0': '没有',
  '20|1': '1 格——中间那个 26 音调资源单元，标准那张音调表的这两种分法本来都把它排除在外',
  '40|0': '没有',
  '40|2': '2 格——26 音调 RU 5 与 RU 14；40 MHz 没有「中间那一格」，18 是偶数，直流落在 RU 9 与 RU 10 之间',
}

/** One row of the share table: everything but the last column is the engine's own arithmetic. */
const shareRow = ([w, n]: readonly [20 | 40, 2 | 3 | 4]): string[] => {
  const full = selBins(w)
  const mine = selMemberBins(w, 1 / n)
  const left = full - n * mine
  return [
    `${w} MHz，${n} 个成员`,
    String(full),
    String(full / n),
    String(mine),
    LEFTOVER[`${w}|${left}`]!,
  ]
}

export const ruDiversity: Lesson = {
  id: 'ru-diversity',
  module: 9,
  title: '成员的格数——资源单元变窄后，变差的是分布的尾部而不是平均值',
  why: '前一课的结论是：把一条信道划分为几部分同时发给多台设备，每台收到的帧完全相同，节省的是空口时间（airtime）。而「频率选择性」那一课的结论是：一条信道按每 26 根音调一块划分成格之后，格数越多，同一份编码冗余要弥补的缺口就越分散。把这两个结论放在一起，还剩一项尚未计算的代价——一个多用户（multi-user, MU）成员得到的，只是它自己那一个资源单元（resource unit, RU）上的格，而不是整条信道的格。接收端把自己那几格合成为一个有效信噪比（signal-to-noise ratio, SNR）时，是在对各格取平均，格越少，参与平均的项越少：合成值的平均值和中位数几乎不变、四格甚至略好，起伏却向两端同时扩大，偶尔更好，偶尔差得多。判决只看是否超过门限，深的那一端就意味着一次重传（retry）。所以在余量完全可比的同一条链路（link）上，两台电视编入同一次发送、各读九格中的四格时，丢帧率从整条九格时的不到两成升高到四分之一以上；变差的不是平均值，而是分布的尾部。四格配置最深的一格反而更浅，用最深一格比较会得出与实测相反的结论。这一现象只在一段余量范围内可见：余量宽时两种配置都几乎不丢帧；余量降到零附近以下时，方向完全相反，因为起伏大成了偶然解出一帧的唯一原因。本课的工作点距离那条边界只有一米。',
  outcomes: [
    '说出一个成员的格数如何计算，以及 20 MHz 上两个成员为什么各读四格而不是四格半',
    '读出资源单元变窄后损失分布的哪一端发生了变化：中位数、第九十百分位与最深那一格各向哪个方向变化',
    '判断这一现象在什么样的余量下可见，并说出余量过宽、过窄时各会出现什么情况',
  ],
  needs: ['ofdma-dl', 'selectivity'],
  terms: [
    { term: '成员那一份', plain: '一次多用户发送中分配给某一台设备的那一块子载波，以占比的形式记录在该设备自己的条目中' },
    { term: '成员的格数', plain: '这一份覆盖多少个 26 音调资源单元：整条信道的格数乘以这一份，再向下取整为整数格' },
    { term: '起始格', plain: '这一部分从信道的第几格开始，等于排在它前面各成员格数之和' },
    { term: '频率分集', plain: '同一帧分布在多个格上，深衰落的格与浅衰落的格相互补偿带来的增益；格越少，这项增益越小' },
    { term: '被截掉的那一格', plain: '等分结果不是整数格时取整舍去的格；它不属于任何成员，在本仿真器里根本不存在' },
  ],
  picture: [
    { heading: '一个资源单元对应一段格号', text: `划分资源单元和划分格使用的是同一条频率轴。正交频分多址（orthogonal frequency-division multiple access, OFDMA）把子载波（sub-carrier）成块地分配出去，一块就是一个资源单元；而频率选择性按 ${selBinWidthMhz()} MHz 一格取衰落深度，一格就是最小的那种资源单元，也就是 26 根相邻音调。因此一个成员的资源单元，用格来度量也是一段连续的格号。它解调这一帧时读取的是自己这一段里的格，整条信道其余的格与它无关——那几格此刻衰落是深是浅，它既读取不到，也无法改用。` },
    { kind: 'watch', jump: 1, heading: '在事件日志中观察', text: `载入仿真，跳到第一条带份额的合成记录。本课的场景是两台电视加一台路由器，20 MHz、单流，衰落与分格同时启用。打开「事件日志」，找到写有 selectivity 的那一行——行首是时间戳，这个词位于两个节点名之后：它末尾那一段不再只是 over ${selBins(20)} bins，而是 over bins 0–${selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}, its 1/2 of the channel；另一台电视那一行写的是 bins ${selMemberBins(20, 1 / 2)}–${2 * selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}。两个成员各占一段连续的格号，而第 ${selBins(20) - 1} 格（格号从 0 开始计）两台都没有分到。` },
    { heading: '为什么场景一载入就使用最低一级速率', text: '两台电视在卧室，与路由器之间隔着两道砖墙，所以这条链路上每一帧都使用最低一级的调制与编码方式（modulation and coding scheme, MCS）。这在物理上是自洽的，并不是场景参数设置不当：两道砖墙各造成十二分贝的损耗，到达电平只剩约 −81 dBm，速率上限本来就只有这一级。这是本课的前提而不是缺陷——余量只有三个半分贝，格数的影响才能显现；而速率已经固定在最低一级，信号再变差就只能丢帧，而不会表现为降级。两台电视到路由器的距离完全相同、隔着同样两道墙，所以它们具有相同的平均信噪比（signal-to-noise ratio, SNR），也就具有相同的余量——这是后面能把两种配置放在一起比较的全部依据。' },
    { heading: '格数减少，首先增大的是起伏', text: '合成这一步对各格的容量取平均，再换算回分贝。取平均的项数就是格数：九项的平均比四项的平均稳定，四项的平均比两项的稳定。所以格数减少时，这个合成值的中位数几乎不变，甚至还会略好一些——而它的起伏增大，并且向两端同时扩大：偶尔比均值还好，偶尔差得多。判决是一个门限，超过就能解出、未超过就重传（retry），所以只有深的那一端会计入丢帧。「资源单元越窄越危险」的全部含义就是这一句：不是每一帧都差一点，而是偶尔差得多，而偶尔差得多正是一个成员需要重传的原因。' },
  ],
  numbers: [
    { kind: 'steps', heading: '引擎如何计算一个成员的格数：逐步说明', items: [
      '接入点（access point, AP）组建好这一组后，把每个成员所占的份额写入该成员自己的条目（muParts 里的 ruFraction）。两个成员就各占二分之一。',
      '解调一帧时，先确定这条记录属于哪个成员：有份额就按这一份计算，没有份额就是整条信道——按空间划分的那种多用户发送走的正是这一分支，它的成员本来就占满整条带宽。',
      `格数 = 整条信道的格数 × 这一份，再向下取整为整数格，下限一格。20 MHz 是 ${selBins(20)} 格，两个成员等分得 ${selBins(20) / 2}，取整为 ${selMemberBins(20, 1 / 2)}。`,
      `起始格 = 排在它前面各成员的格数之和。两个成员就是 0 与 ${selMemberBins(20, 1 / 2)}，于是被截掉的那一格位于信道最高端，没有分配给任何成员——它在记录里可以看到，这是按顺序累加、而不是让两个成员都从 0 开始的唯一好处。`,
      '只在自己这几格上各取一次快衰落偏差值。干扰与噪声在每一格里是同一个数，所以逐格起伏的只有信号这一侧。',
      '按容量把这几格换算为一个有效信噪比，再与这一级速率的门限比较：超过则解出，未超过就是一次未能解出的接收，随后重传。',
    ] },
    { kind: 'formula', heading: '两个公式，分别对应上面的一步', text: '成员的格数 = ⌊整条信道的格数 × 这一份⌋，下限 1\n起始格 = 排在它前面各成员格数之和', note: '向下取整并不是为了简便：十五种（带宽，成员数）组合里只有三种等分后不是整数格，而这三种的取整结果与标准那张音调表逐一吻合，下一张表的最后一列就是对照。' },
    { kind: 'table', heading: '等分、取整，以及未分配给任何成员的格', head: [
      '带宽与成员数', '整条信道的格数', '等分之后', '取整为整数格', '未分配的格',
    ], rows: SHARE_CASES.map(shareRow) },
    { heading: '那几格的去向', text: '标准中没有「n 块同样大小的资源单元」这种划分，它给出的是一张离散的音调表。20 MHz 上两个成员对应两个 106 音调资源单元，各覆盖四格，而中间那个 26 音调资源单元不在其中任何一个里——标准自己的划分本来就把它排除在外，所以取整舍去的那一格并不是本仿真器丢失的。真实的调度器会把它分配给其他成员，或者用 52+26 这样的多资源单元分配把它纳入；本仿真器两者都不做，那一格就不存在。' },
    { kind: 'table', heading: '同一个实测余量组里的两种配置（1000 ms，两种配置同户型、同位置、同种子）', head: [
      '配置', '成员那一份', '格数', '未能解出的接收', '丢帧率',
    ], rows: [
      ['两台电视编在同一次下行发送里', '二分之一', String(selMemberBins(20, 1 / 2)), '282 条中 74 条', '26.24 %'],
      ['同一台电视，关闭 OFDMA', '整条信道', String(selBins(20)), '138 条中 25 条', '18.12 %'],
    ] },
    { heading: '这张表的分组是预先确定的', text: '两种配置都按每条接收自身实测的余量分组，取最大的那一组，不逐条指定组内成员——选组时不考虑是哪台设备、不考虑格数、不考虑速率。这一组的余量是 3.547 dB，包含这一轮 292 条下行（downlink, DL）接收中的 283 条，所以它不是一个局部特例，它代表的就是这一轮。分组使用的是原始浮点数而不是四舍五入后的值，所以落在组外的那 9 条并不是另一个工作点：它们与组内那个值只在小数点后第十四位有差别（约一百万亿分之一分贝），属于浮点数自身的误差。OFDMA 关闭的配置按同一条规则是 140 条中的 138 条，因此两种配置的分母都是各自一轮的全体，而不是挑选出来的。先确定分组再读丢帧率，是为了防止通过更换分组来得到想要的结果。' },
    { heading: '变差的是尾部，而不是平均值', text: '把同一组里每条接收的损失按大小排列，四格与九格差别最大的地方不在中间，而在深的那一端。平均损失几乎相同：九格 2.098 dB，四格 2.068 dB，四格还低 0.03 dB。中位数也向好的方向变化：从 2.167 dB 降到 1.804 dB。第九十百分位则相反：从 4.439 dB 升高到 5.420 dB。最深的那一条从 7.007 dB 变为 12.006 dB。而合成之后比均值还好的接收，九格中 138 条有 12 条，四格中 282 条有 59 条——占比从 8.7 % 升高到 20.9 %。分布向两端同时扩展，这正是取平均的项数减少时应有的结果，而丢帧只计入深的那一端。' },
    { heading: '最深那一格反而更浅，丢帧却更多', text: '同一组里，九格配置最深一格的中位数比均值低 11.917 dB，四格配置只低 7.547 dB——格数少了，取到很深一格的机会本来就少。所以两种配置中丢帧更多的那一种，最深那一格反而更浅。「频率选择性」那一课讲过的结论在这里再次适用：最深那一格是曲线的最低点，不是这条链路的损失，判决依据的是合成值。用最深那一格比较两种配置，会得出与实测相反的结论。', },
    { heading: '这一现象只在一段余量范围内可见', text: '上面那张表不是一条普遍成立的规律，而是一个窗口内的测量结果。余量很宽时两种配置都几乎不丢帧，无法区分优劣——前一课的场景就处于这一端，它那一轮的余量中位数是 15.4 dB。而余量降到零附近以下时方向会完全相反：余量为负意味着按均值计算这一帧本来就解不出来，此时起伏大反而是它能够偶然解出的唯一原因，于是格少的配置丢帧更少。这个窗口的下边界没有测出一个确定的数，测出的是一个区间：在 3.547 dB 处方向为正，在 2.381 dB 处已经相反，所以它位于这两个数之间的某处，而本课的工作点距离它不到 1.2 dB。把两台电视沿同一条直线向外移动一米，余量降到 2.381 dB，两种配置的方向就相反了（整条九格 39.25 %，成员四格 37.67 %）；向内移动一米，余量 4.826 dB，方向仍然为正（成员四格 18.44 % 对整条九格 6.56 %）。所以「资源单元越窄越危险」这一直觉存在下边界，而这个场景距离那条边界只有一米。这并不是场景参数设置不当，这正是那个直觉的真实适用范围。这个窗口的两条边界都随链路自身的平均信噪比移动，本课只测量了它在本课这条链路上的位置。', },
    { kind: 'table', heading: '窗口边界的两侧（纯函数抽样，不是一轮仿真）', head: [
      '余量', '资源单元变窄之后', '本课在此能观察到什么',
    ], rows: [
      ['零附近或为负', '方向相反：格少则起伏大，而起伏大是这条链路能够偶然解出一帧的唯一原因', '会观察到与本课相反的方向'],
      ['本课的 3.547 dB', '资源单元变窄之后丢帧更多，而且是严格更多', '可以清楚地观察到'],
      ['十五分贝以上', '两种配置都接近零', '两者都为零，观察不到任何差别'],
    ] },
  ],
  deeper: [
    { heading: '为什么这个场景无法组成三个成员的组', text: '把份额从二分之一减小到三分之一、四分之一，这一趋势理应继续延伸，而这个场景一次也无法实现：buildMuParts 会跳过第一个 MSDU 无法在 PPDU 时长上限内容纳的成员，而份额越小、资源单元越窄，同样的字节占用的空口时间就越长。在最低一级速率上，一个视频包放在三分之一信道的资源单元里就超过了那个上限，于是三个成员的组整个解散，接入点退回到一次只服务一台。实测结果：同一个户型里放三台电视，1000 ms 内 349 次下行发送一次也没有组成组。所以三分之一与四分之一这两档在这个场景中只能用模型估计：取每条接收自身实测的均值与门限，重新抽取 k 格再判决一次。那个模型在二分之一这一档上有实测对照，两者相差在两个百分点以内，所以它反映的趋势值得一提；但它的四个百分数是抽样的均值，不是测量值，本课一个也不给出。' },
    { heading: '为什么不用两轮送达的帧数来比较', text: '一个很自然的问题是：启用 OFDMA 之后送达的帧是否变少了？这一轮里确实变少了——启用时 216 帧，关闭时 224 帧（1000 ms，接入点发出、电视解出的数据帧）。但这个差值不能作为本课的证据，理由与「频率选择性」那一课不允许用丢帧数比较五种带宽相同：两轮在空口上的差别不只是一个份额。启用 OFDMA 时每次发送要返回两个确认，关闭时只返回一个；两轮的帧长、发送次数、队列积压量都随之变化，而这条链路本来就远远无法满足两台电视的流量需求（两轮都丢弃了一千八百多个 MSDU）。能直接相减比较的只有「同一个余量下，每次接收未能解出的比例」，那是逐次接收的性质，所以上面那张表比较的是比例，而不是条数。' },
    { heading: '起始格带来的不是物理效应', text: '按 muParts 的次序分配一段连续的格号，而不是让每个成员都从第 0 格开始，在这个模型里不改变任何一个判决：各格是彼此独立的抽样，合成又是无序平均，所以一段四格的窗口位于九格中的哪个位置，它的分布都完全相同。它带来的是另外三点：记录里能读出位置而不只是一个计数；被截掉的那一格会留在信道最高端，因而可以看到；以及格间相关长度一旦有了取值，位置立即从记录信息变为物理量，届时不必重写这一部分。另外有一点容易记错：同一台电视在两次发送中的成员次序并不固定，下行的成员顺序取决于在队列中首次出现的先后，所以「某台设备总是分到前四格」在这个引擎中并不成立。' },
  ],
  sources: [
    '26 音调资源单元是 OFDMA 最小的那种资源单元，也是标准给信道质量回报用的分格单位：IEEE Std 802.11be-2024 §9.4.1.75 的 EHT CQI Report 字段给出每 20 MHz 九块，并明确把未定义的 26 音调 RU（RU 19、56、93、130）排除在回报之外。每格 2.03125 MHz 由 26 根音调与 78.125 kHz 的子载波间隔算出（§36 的 Table 36-18），源码里没有这个字面值。',
    '三种等分不出整数格的情形与标准音调表的对照出自 IEEE Std 802.11-2024 §27.3.2.2 的 Table 27-8（20 MHz）与 Table 27-9（40 MHz）：两个 106 音调资源单元各覆盖四格、四个 52 音调资源单元各覆盖两格，而 Table 27-8 的 NOTE 2 把中间那个 26 音调资源单元单独点出来。52+26 这类多资源单元分配出自 IEEE Std 802.11be-2024 §36.3.2.2.2。',
    '一片资源单元里再按空间分给几台，标准把它规定成一项具名、带能力位的特性（DL/UL MU-MIMO within OFDMA），并给了资源单元尺寸下限：HE 不小于 106 音调（IEEE Std 802.11-2024 §27.1 与 HE PHY Capabilities 的相应子字段），EHT 不小于 242 音调（IEEE Std 802.11be-2024 §36.1.1 与三条 Partial BW MU-MIMO 能力条款）。换算为格就是最少四格与九格。',
    '按容量把各格换算为一个有效信噪比、以及把成员那一份取整为整数格，都是本仿真器的选择：标准不规定接收机如何合成，也不规定调度器如何分配资源单元。逐格偏差的分布沿用场景里 fading 那一节的取值（engine/fading.ts）。',
    '本课每一个数的测量条件都注明在它旁边，断言在 tests/course/ru-diversity.test.ts；两种配置的发布判据在 tests/engine/selectivity-round.test.ts；位置不起作用那一条的标度无关形式（极差对标准误）在 tests/engine/selectivity.test.ts。',
  ],
  limits: [
    { kind: 'model-value', text: '把成员那一份取整为整数格是本仿真器的规则，不是标准的条款：格数 = 整条信道的格数 × 这一份，再向下取整为整数格，下限一格（engine/selectivity.ts 的 selMemberBins）。这一规则成立，是因为三种会出现的非整数情形与标准那张音调表逐一吻合——20 MHz 两个成员是两个 106 音调资源单元、各四格；20 MHz 四个成员是四个 52 音调资源单元、各两格；40 MHz 四个成员是四个 106 音调资源单元、各四格。而被截掉的那一格在引擎里根本不存在，而且不能笼统地称为「那一格」：20 MHz 两个成员丢一格（中间那个 26 音调资源单元），40 MHz 四个成员丢两格（26 音调 RU 5 与 RU 14），而 40 MHz 根本没有中间那一格——18 是偶数，直流落在 RU 9 与 RU 10 之间。真实调度器会把剩下的格分配给其他成员，或者用 52+26 这样的多资源单元分配把它纳入。' },
    { kind: 'unmodelled', text: '各格是彼此独立的抽样，所以一个成员占用信道的哪一段，在本仿真器里与它的判决无关：位置完全不起作用。这不是「影响很小」——各格独立而合成采用无序平均，所以九格中六个四格窗口之间的真实差距精确为零；测得的那一点差距处于它自身抽样标准误的量级，所以它就是这次抽样本身的误差，而不是一个效应。起始格在这里只为使记录可读，以及为格间相关长度有取值的那一天预留位置。真实信道的相邻格会同时变深或变浅，相干带宽是有限的，那时位于边缘的资源单元与位于中间的资源单元就不再等价。格间独立假设会高估频率分集——而由此推出的偏差方向要分两部分说明，因为两部分方向相反。成员自身那一份付出的代价被低估了：相干带宽有限时，它那一部分里的有效样本比格数还少，它的丢帧比本课测得的更多。而本课那张表测量的不是这个，而是两种配置之差，这个差被高估了：格之间一旦相关，格多的那种配置先失去分集，两种配置的差距随相干带宽变宽而不断缩小，相干带宽覆盖整条信道时两种配置都只剩一个有效样本、差距降为零。真实住宅信道处于差距仍然明显存在的那一端，所以这张表的方向是可靠的；它的大小则不可靠。这两部分都只有方向，没有数值——格间相关长度在本仿真器里没有取值，而给它一个取值就等于发明一个标准中不存在的物理量。' },
    { kind: 'unmodelled', text: '误包率在这里与帧长无关：判决是针对每一次发送的一个硬门限（信干噪比与这一级速率的灵敏度门限比较，channel.ts 的 decodeThreshDb 只读取速率，不读取字节数），所以一次发送要么整个解出、要么整个解不出，承载多少载荷都一样。这一点恰好使本课那张表的结果产生偏差：OFDMA 关闭的配置每条接收承载的是一个两帧聚合、2870 字节，而成员配置每个成员只承载 1434 字节，两者占用的空口时间却几乎相同（2.727 对 2.731 ms）。于是整条九格的配置在本仿真器里「免费」多承载了一倍载荷，表里那 8 个百分点的差距因此被略微放大。真实接收机的长帧误包率更高，所以真实的差距比表里更小——但方向不变。', },
    { kind: 'threshold', text: '合成使用的是容量，而真实接收机达不到容量，所以本课给出的每一个损失都是下界：真实的损失更大，丢帧也更多。这不是上面那条格间相关的另一种表述，两件事要分开理解：那一条涉及的是本仿真器不需要的一个数（位置在这个模型里确实无关），这一条涉及的是本仿真器明确拒绝发明的一个数——指数有效信噪比映射（exponential effective SINR mapping, EESM）要为每一级调制与码率各配一个 β 系数，而标准从未给出 β，因此这里宁可给出一个可以说清楚的下界。而它在本课有确定的方向：一个真实的码与容量这一上界相距多远，取决于它能分布在几个彼此独立的衰落上，分布得越少，按容量算出的值就越乐观——所以成员那一份越窄，这个下界与真实值相距越远。于是真实的尾部代价比本课测得的更大，而这是本课唯一一条使那张表的差距向增大方向偏移的机理：上面两条（格间相关，以及判决不读取帧长）都使它向减小方向偏移。三条都没有取值可测，所以三条都只能给出方向，不能给出数值。' },
    { kind: 'model-value', text: '资源单元在这里仍然只有一种尺寸——成员数的倒数，再取整为整数格（mac.ts 的 frac = 1 / 成员数）。标准的资源单元尺寸来自一张离散的音调表（26、52、106、242、484、996……），调度器可以给积压多的成员分配一个大的资源单元、给只有一个小帧的成员分配一个 26 音调的，也可以留出几块不分配；选择哪一种由调度器决定，而标准不规定调度器。所以本课计算的是「分到的格减少会怎样」，而不是「调度器应该如何分配」——后者需要发明一条资源单元选择规则，而那会是一个比等分更大、而且没有出处的模型取值。' },
    { kind: 'out-of-scope', text: '同组互不干扰仍然是按定义设定的：引擎把一次多用户发送的各部分标为同一个 orthogonalGroup，同组之间不计入彼此的干扰（channel.ts）。而逐格处理只改变信号这一侧，干扰与噪声在每一格里是同一个数。所以不要用本课去研究「两个成员之间的泄漏」——相邻资源单元之间的保护音调与泄漏在这里都没有建模。还有一点需要事先说明，否则格号会被误解为设备的编号：格号区间属于那个资源单元，而不属于某一台设备。标准允许在一个资源单元内再按空间分配给几台设备，为这一特性规定了名称和能力位，还规定了尺寸下限（HE 不小于 106 音调、EHT 不小于 242 音调，换算为格是最少四格与九格），那时几台设备会共用同一段格号，而各自独立地取各自的衰落值。本仿真器把按频率划分与按空间划分设计为互斥的（mac.ts），所以这种情形不会出现，细节在 mumimo-choose 那一课。' },
    { kind: 'out-of-scope', text: '成员那一份的格数只作用于解调这一步：合成发生在锁定之后（channel.ts 的 resolveLock），而载波侦听、前导检测与捕获效应（capture effect）依据的仍然是整条信道的那一次平坦抽样，发送端选择哪一级速率依据的甚至不是这一帧的抽样——而是链路表里那个静态的均值电平（simulation.ts 的 mcsForPeer，它自己的注释写明了理由：帧尚不存在时就要确定级别，发送端不可能知道这一帧会经历怎样的衰落）。「频率选择性」那一课记录过一次这样的不对称，本课使它又多了一层：成员的解调读取它那一部分的格，而它的选级读取整条信道的那一个值。这一层很重要，因为读者看完那张表就会问「成员确实只读四格，速率控制为什么不降一级来补偿」。本课场景的答案是「速率已经固定在最低一级」，而这只在这个场景中成立；换一个不处于最低一级的场景，速率控制确实会调整，但它调整的依据是这条链路连续两次失败（engine/rate.ts），而不是成员那一部分有多窄：它总是先丢失两帧再降一级，而降级改变的是整条链路的级别，无法区分「这一部分窄」与「这条链路差」。所以不要把本课的结论理解为「速率控制会为成员吸收这项代价」。' },
    { kind: 'out-of-scope', text: '本课只能讨论下行，而阻碍上行的并不是本课引入的东西。上行那一部分的份额现在确实写在被触发的那一帧上了，但是触发式应答使用哪一级速率，取的是 cfg.mcsForPeer——接入点对那台设备的下行速率控制回路；而 closeTbPpdu 从不调用 onTxOutcome（engine/rate.ts 的文件头自己记着「上行多用户两边都不回报」），所以为上行应答确定速率的那个闭环从未闭合。接入点发射 20 dBm、站点发射 15 dBm，于是那一级速率是按比上行高 5 dB 的那条路径选出来的。其后果是上行的余量不受速率控制约束，它要么过宽、要么为负，两种情况下本课所需的余量窗口都不成立：实测 ofdma-ul 那个场景上行成员的余量是 12.195 dB，80 条接收一条也没有丢失（测量条件：那一课的场景加上 fading 与 selectivity 两节，1000 ms，上行成员一侧）。所以不要用本课的结论去解释上行多用户的丢帧。' },
  ],
  scenario: () => ruDiversityScenario(),
  variants: [
    { label: '两个成员（各四格）', scenario: () => ruDiversityScenario(true) },
    { label: 'OFDMA 关闭（整条九格）', scenario: () => ruDiversityScenario(false) },
  ],
  jumps: [
    J('第一次包含两个成员的下行发送', firstMuDl),
    J('第一条带份额的合成记录', (r) => r.type === 'WIFI_SEL' && r.ruFraction !== undefined),
    J('第一次未能解出的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    `跳到第一条带份额的合成记录：末尾写的是 over bins 0–${selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}, its 1/2 of the channel，而另一台电视那一行是 bins ${selMemberBins(20, 1 / 2)}–${2 * selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}——哪台分到前一段并不固定，成员次序取决于队列（queue）中的先后。同一行前面的三个读数是 mean、worst bin 与 effective，而整条信道的记录——写有 over ${selBins(20)} bins 的那一条——整轮只有 1 条：那是唯一一次没有组成组的发送。这两个数要结合时长理解：本课默认载入的 150 ms 内，接入点发出的合成记录共 45 条，其中 1 条是整条信道；把这一轮运行到后面几张表所用的 1000 ms，是 292 条中的 1 条。两种时长下整条信道的记录都只有一条。`,
    '再观察同一行的 loss 和紧随其后的那条接收结果。loss 大多在 2 dB 左右，偶尔为负（合成之后比均值还好），偶尔超过十分贝；损失很大的那几次后面紧跟的就是未能解出的接收。切换到「OFDMA 关闭」那个变体再看一遍：loss 的中位数反而略高，而损失很大的那几次变少了。',
  ],
  tryThis: [
    '在本课的两个变体之间来回切换。「OFDMA 关闭」是同一个户型、同一组位置、同一个种子、同一条链路，唯一的区别是每次接收读取 4 格还是 9 格，而两种配置读到的余量是同一个浮点数（OFDMA 关闭的配置 140 条中有 138 条如此，其余 2 条不是；`numbers` 里那句话给出了准确的计数）——这正是前一课「把 OFDMA 关闭」那个实验，只是换了一个问题：这一次要看的不是节省了多少空口时间，而是同一个余量下丢帧的比例从 18.12 % 升高到 26.24 %。',
    '点击「在编辑器中打开」，在卧室里再放置一台同样的电视，重新载入。分组会完全失效：1000 ms 内 349 次下行发送一次也没有包含两个成员，三个成员的组一次也组建不起来。原因在于空口时间——份额越小、资源单元越窄，同样的字节要占用越长的空口时间，而在最低一级速率上，一个视频包放在三分之一信道的资源单元里就超过了一次发送的时长上限。所以「资源单元越窄越差」这一趋势，在这个场景中只能验证到二分之一为止。',
  ],
  quiz: [
    {
      q: '同一个余量组里，四格配置丢帧更多，但它最深那一格反而比九格配置更浅。这两点矛盾吗？',
      options: [
        '矛盾：丢帧更多就说明它遇到的格更深',
        '不矛盾：判决依据的是各格换算成的有效信噪比，而格数减少之后这个合成值的起伏更大，深的那一端因此更深',
        '不矛盾：最深那一格会被均衡器补偿，所以它与丢帧无关',
      ],
      answer: 1,
      explain: '格数是取平均的项数：项数少，平均值的起伏就大，分布向两端同时扩展。最深那一格取决于抽样次数，抽样少就浅；而丢帧取决于合成值深的那一端，它反而更深。',
    },
    {
      q: '前一课的场景里也有两台电视编在同一次发送中，而添加这两节之后，它那一轮的余量中位数是 15.4 dB。把本课这张表的分析用到那个场景上，会怎样？',
      options: [
        '差距会变得更大，因为那条链路更好',
        '两种配置都几乎不丢帧，差距变为两个零——读者在自己的屏幕上看不到本课要讲的现象',
        '完全不变：丢帧率已经除以接收条数了',
      ],
      answer: 1,
      explain: '除以接收条数解决的是「两轮发送的次数不同」，解决不了「两种配置都是零」。余量宽达十五分贝时，格数减少一半也改变不了任何一次判决——所以本课要单独建立一个余量处于窗口内的场景，而不是附在前一课后面多写一段。',
    },
  ],
}
