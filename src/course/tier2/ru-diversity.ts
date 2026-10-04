/**
 * Wi-Fi Tier 2 · M7 · Scheduled Wi-Fi 6/7 · what a member's own resource unit costs it
 * in frequency diversity.
 *
 * The lesson of slice 4b (docs/superpowers/specs/2026-10-04-ru-diversity-design.md §7.2,
 * §7.5). It sits immediately after `ofdma-dl`, because `ofdma-dl`'s own `limits` entry is its
 * subject: a member used to be credited with the whole channel's bins, and now reads only the
 * bins inside its own share.
 *
 * **Why it is a lesson of its own and not a paragraph in `ofdma-dl`** (design §7.1, all three
 * reasons measured): `ofdma-dl` is 20 minutes with about 231 characters of room left;
 * `selectivity` is already at the 30-minute ceiling; and — the reason that matters —
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
 * **CAUTION — this lesson is at the 30-minute ceiling** (`MAX_MINUTES`, asserted in
 * tests/course/kit.ts and readability.test.ts), with about 500 Chinese characters of main-path
 * room left and **no room for a third `observe` or `tryThis` entry**: each of those is worth 2
 * and 4 minutes outright, which crosses the ceiling on its own. `limits`, `deeper` and `sources`
 * are not counted, which is why Task 6 of this slice put all four of its additions there — two
 * new `limits` entries (design §10.1's rate-selection asymmetry, which §10.1 names as owed to
 * this lesson, and §10.2's capacity direction), the split of the inter-bin entry's direction,
 * and the clause attributions.
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
  '20|1': '1 格——中间那个 26 音调资源单元，标准那张音调表的这两种分法本来都把它留在外面',
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
  title: '成员那一片的格数——切薄之后变坏的是分布的尾部，不是平均',
  why: '前一课的结论是：把一条信道切成几片同时发给好几台设备，每台收到的帧一模一样，省下来的是空口时间（airtime）。而「频率选择性」那一课的结论是：一条信道按 26 根音调一块分成格之后，格数越多，同一份编码冗余要补的缺口就越分散。这两句话放在一起，剩下一笔还没有算过的代价——一个多用户（multi-user, MU）成员拿到的，只是它自己那一片资源单元（resource unit, RU）上的格，不是整条信道的格。这一课量的就是这一笔：在余量完全可比的同一条链路（link）上，一台电视读九格里的四格时解不出来的接收，比它读整条九格时更多；而变坏的不是平均，是分布的尾部。',
  outcomes: [
    '说出一个成员的格数是从哪里算出来的，以及 20 MHz 上两个成员为什么各读四格而不是四格半',
    '读出切薄一片把损失分布的哪一头改了：中位数、第九十百分位与最深那一格各往哪边动',
    '判断这件事只在什么样的余量上看得见，并说出余量太宽、太窄时各会发生什么',
  ],
  needs: ['ofdma-dl', 'selectivity'],
  terms: [
    { term: '成员那一份', plain: '一次多用户发送里分给某一台设备的那一块子载波，写成一个占比记在它自己那一条上' },
    { term: '成员的格数', plain: '这一份覆盖多少个 26 音调资源单元：整条信道的格数乘以这一份，再向下截到整数格' },
    { term: '起始格', plain: '这一片从信道的第几格开始，等于排在它前面各成员格数之和' },
    { term: '频率分集', plain: '同一帧摊在好几格上，深的格与浅的格互相抵消掉的那一份好处；格越少，这份好处越少' },
    { term: '被截掉的那一格', plain: '等分不是整数格时取整丢掉的格；它不属于任何成员，在本仿真器里干脆不存在' },
  ],
  picture: [
    { heading: '一片资源单元，就是一段格号', text: `分片和分格用的是同一根频率轴。正交频分多址（orthogonal frequency-division multiple access, OFDMA）把子载波（sub-carrier）成块地分出去，一块就是一个资源单元；而频率选择性按 ${selBinWidthMhz()} MHz 一格抽衰落的深浅，一格就是最小的那种资源单元，也就是 26 根相邻音调。于是一个成员那一片，在格这把尺上也是一段连着的格号。它解这一帧读的是自己这一段里的格，整条信道其余的格与它无关——那几格此刻是深是浅，它既读不到，也躲不进去。` },
    { kind: 'watch', jump: 1, heading: '去看一眼', text: `载入仿真，跳到第一条带着份额的合成记录。这一课的场景是两台电视加一台路由器，20 MHz、单流，衰落与分格一起打开。打开「事件日志」，找写着 selectivity 的那一行——行首是时间戳，这个词在两个节点名之后：它末尾那一段不再只是 over ${selBins(20)} bins，而是 over bins 0–${selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}, its 1/2 of the channel；另一台电视那一行写的是 bins ${selMemberBins(20, 1 / 2)}–${2 * selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}。两个成员各占一段连着的格号，而第 ${selBins(20) - 1} 格（格号从 0 数起）两台都没拿。这一段写在整行的末尾，所以窄屏上要把这一行往右拉才看得到。` },
    { heading: '为什么打开场景第一眼就是最低一级速率', text: '两台电视在卧室，离路由器隔着两道砖墙，所以这条链路上每一帧都走最低一级的调制与编码方式（modulation and coding scheme, MCS）。这是物理自洽的，不是场景没调好：两道砖墙各吃掉十二个分贝，到达电平只剩约 −81 dBm，速率上限本来就只有这一级。它是这一课的前提而不是毛病——余量只有三个半分贝，格数这件事才看得见；而速率已经钉在最低一级，再掉就只能掉帧，不会被降档换掉。两台电视到路由器的距离完全相同、隔着同样两道墙，所以它们共享同一个平均信噪比（signal-to-noise ratio, SNR），也就共享同一个余量——这是后面能把两腿放在一起比的全部理由。' },
    { heading: '格少了，先变大的是起伏', text: '合成这一步把各格的容量取平均，再反解回分贝。取平均的项数就是格数：九项的平均比四项的平均稳，四项的平均比两项的稳。所以格数变少，这个合成值的中位数几乎不动，甚至还会略好一点——而它的起伏变大，两头都变大：偶尔比均值还好，偶尔深得多。判决是一个门限，过了就解出来、没过就重传（retry），所以只有深的那一头会算进掉帧里。「切薄一片更危险」的全部内容就是这一句：不是每一帧都差一点，是偶尔深得多，而偶尔深得多正是一个成员要重传的原因。' },
  ],
  numbers: [
    { kind: 'steps', heading: '引擎给一个成员算格数，一步一步', items: [
      '接入点（access point, AP）编好这一组，把每个成员占的那一份写进它自己那一条（muParts 里的 ruFraction）。两个成员就各占二分之一。',
      '解调一帧的时候，先问这条记录属于哪个成员：有份额就按这一份算，没有份额就是整条信道——按空间划分的那种多用户发送走的正是这一路，它的成员本来就占满整条带宽。',
      `格数 = 整条信道的格数 × 这一份，再向下截到整数格，下限一格。20 MHz 是 ${selBins(20)} 格，两个成员等分得 ${selBins(20) / 2}，截成 ${selMemberBins(20, 1 / 2)}。`,
      `起始格 = 排在它前面各成员的格数之和。两个成员就是 0 与 ${selMemberBins(20, 1 / 2)}，于是被截掉的那一格落在信道顶上，谁也没拿——它在记录里看得见，这是按顺序累加而不是让两个成员都从 0 开始的唯一好处。`,
      '只在自己这几格上各抽一次快衰落偏差。干扰与噪声在每一格里是同一个数，所以逐格起伏的只有信号这一侧。',
      '按容量把这几格折成一个有效信噪比，再与这一级速率的门限比一下：过了就解出来，没过就是一次解不出来的接收，随后重传。',
    ] },
    { kind: 'formula', heading: '两条式子，各自对应上面一步', text: '成员的格数 = ⌊整条信道的格数 × 这一份⌋，下限 1\n起始格 = 排在它前面各成员格数之和', note: '向下取整不是图方便：十五种（带宽，成员数）组合里只有三种等分不出整数格，而这三种的取整结果与标准那张音调表逐个吻合，下一张表的最后一列就是对照。' },
    { kind: 'table', heading: '等分、取整，和谁也没拿的那几格', head: [
      '带宽与成员数', '整条信道的格数', '等分之后', '截到整数格', '谁也没拿的格',
    ], rows: SHARE_CASES.map(shareRow) },
    { heading: '那几格去哪了', text: '标准没有「n 块同样大的资源单元」这回事，它给的是一张离散的音调表。20 MHz 上两个成员对应两个 106 音调资源单元，各覆盖四格，而中间那个 26 音调资源单元不在其中任何一个里面——标准自己的划分本来就把它留在外面，所以取整丢掉的那一格并不是本仿真器弄丢的。真实的调度器会把它分给别人，或者用 52+26 这样的多资源单元把它收进来；本仿真器两件都不做，那一格就是不存在。' },
    { kind: 'table', heading: '同一个实测余量组里的两腿（1000 ms，两腿同户型、同位置、同种子）', head: [
      '这一腿', '成员那一份', '格数', '解不出来的接收', '掉帧率',
    ], rows: [
      ['两台电视编在同一次下行发送里', '二分之一', String(selMemberBins(20, 1 / 2)), '282 条里 74 条', '26.24 %'],
      ['同一台电视，把分片关掉', '整条信道', String(selBins(20)), '138 条里 25 条', '18.12 %'],
    ] },
    { heading: '这张表的分组是先定下来的', text: '两腿都按每条接收自己实测的余量分组，取最大的那一组，组里有哪些一条都不点名——选组的时候不看是哪台设备、不看格数、不看速率。这一组的余量是 3.547 dB，装下了这一轮 292 条下行（downlink, DL）接收里的 283 条，所以它不是一个角落，它就是这一轮。分组用的是原始浮点数而不是四舍五入过的，所以掉出组外的那 9 条并不是另一个工作点：它们与组内那个值只差小数第十四位（约一百万亿分之一分贝），是浮点数自己的噪声。关掉分片那一腿按同一条规则是 140 条里的 138 条，两腿的分母因此是各自一轮的全体，不是挑出来的。先定分组再读掉帧率，是为了让这张表不能靠换分组来凑。' },
    { heading: '变坏的是尾部，不是平均', text: '同一组里把每条接收的损失排开看，四格与九格差别最大的地方不在中间，而在深的那一头。平均损失几乎一样：九格 2.098 dB，四格 2.068 dB，四格还低了 0.03 dB。中位数也往好的方向走：2.167 dB 降到 1.804 dB。第九十百分位反过来：4.439 dB 涨到 5.420 dB。最深的那一条从 7.007 dB 走到 12.006 dB。而合成之后比均值还好的那种接收，九格里 138 条有 12 条，四格里 282 条有 59 条——占比从 8.7 % 涨到 20.9 %。两头一起张开，这正是取平均的项数变少该有的样子，而掉帧只数深的那一头。' },
    { heading: '最深那一格反而更浅，而掉帧更多', text: '同一组里，九格那一腿最深一格的中位数是比均值低 11.917 dB，四格那一腿只有 7.547 dB——格少了，抽到很深一格的机会本来就少。所以这两腿里掉帧更多的那一腿，最深那一格反而更浅。「频率选择性」那一课说过的那句话在这里第二次用上：最深那一格是曲线的最低点，不是这条链路的损失，判决读的是合成值。拿最深那一格比较两腿，会得出与实测相反的结论。', },
    { heading: '这件事只在一段余量上看得见', text: '上面那张表不是一条到处成立的规律，它是一个窗口里的测量。余量很宽的时候两腿都几乎不掉帧，没有先后可排——前一课的场景就在这一端，它那一轮的余量中位数是 15.4 dB。而余量落到零附近以下时方向会整个反过来：余量为负意味着按均值算这一帧本来就解不出来，此时起伏大反而是它唯一能偶然解出来的原因，于是格少的那一腿掉得更少。这道窗口的下边缘没有量到一个数，量到的是一个区间：3.547 dB 上方向是正的，2.381 dB 上已经反了，所以它落在这两个数之间的某处，而本课这个工作点离它不到 1.2 dB。把两台电视沿同一条线往外挪一米，余量掉到 2.381 dB，两腿的方向就反了过来（整条九格 39.25 %，成员四格 37.67 %）；往里挪一米，余量 4.826 dB，方向还是正的（18.44 % 对 6.56 %）。所以「切薄一片更危险」这个直觉是有下边界的，而这个场景离那条边界只有一米。这不是场景没调好，这正是那个直觉真实的形状。这道窗口的两条边都随链路自己的平均信噪比移动，本课只量了自己这一条链路上的位置。', },
    { kind: 'table', heading: '闸门的两边（纯函数抽样，不是一轮仿真）', head: [
      '余量', '把一片切薄之后', '这一课在这里能看见什么',
    ], rows: [
      ['零附近或为负', '方向反过来：格少则起伏大，而起伏大是这条链路唯一能偶然解出一帧的原因', '会看见与本课相反的方向'],
      ['本课的 3.547 dB', '切薄之后掉得更多，而且是严格更多', '干净地看得见'],
      ['十五个分贝以上', '两腿都接近零', '并列的零，什么也看不出来'],
    ] },
  ],
  deeper: [
    { heading: '为什么这个场景编不出三个成员', text: '把份额从二分之一推到三分之一、四分之一，这条链条应该继续往上走，而这个场景一次也走不到：buildMuParts 会跳过头一个 MSDU 装不进 PPDU 时长上限的成员，而份额越小、资源单元越窄，同样的字节占的空口时间就越长。在最低一级速率上，一包视频装在三分之一片里就超过了那个上限，于是三个成员整组散掉，接入点退回一次只服务一台。量出来的：同一个户型里放三台电视，1000 ms 里 349 次下行发送一次也没有编成组。所以三分之一与四分之一这两档在这个场景上只能是模型：拿每条接收自己实测的均值与门限，重抽 k 格再判一次。那个模型在二分之一这一档上有实测对照，两者吻合在两个百分点以内，所以它的链条值得一提；但它的四个百分数是抽样的均值，不是测量，这一课一个也不印。' },
    { heading: '为什么不拿两轮送到的帧数来比', text: '一个很自然的问题是：那么分片之后送到的帧是不是变少了？这一轮里确实变少了——开着分片 216 帧，关掉 224 帧（1000 ms，接入点发出、电视解出的数据帧）。但这个差不能当成这一课的证据，理由和「频率选择性」那一课不许用掉帧数比五个带宽是同一个：两轮在空口上并不只差一个份额。开着分片时每次发送要回两个确认，关掉时只回一个；两轮的帧长、发送次数、队列里积压多少都跟着动，而这条链路本来就远远喂不饱两台电视（两轮都丢掉一千八百多个 MSDU）。能干净相减的只有「同一个余量下，每次接收解不出来的比例」，那是逐次接收的性质，所以上面那张表比的是比例，不是条数。' },
    { heading: '起始格换来的不是物理', text: '按 muParts 的次序给一段连着的格号，而不是让每个成员都从第 0 格开始，在这个模型里不改任何一个判决：各格是彼此独立的抽样，合成又走无序平均，所以一段四格的窗口落在九格里哪个位置，它的分布完全相同。它换来的是三件别的事：记录里能读出位置而不只是一个计数；被截掉的那一格会留在信道顶上，于是看得见；以及格间相关长度一旦有了取值，位置立刻从装饰变成物理，而那一天不必重写这一段。顺带一个容易记错的：同一台电视在两次发送里的成员次序并不固定，下行的成员顺序来自队列里首次出现的先后，所以「某台设备永远拿前四格」在这个引擎上是不成立的。' },
  ],
  sources: [
    '26 音调资源单元是 OFDMA 最小的那种资源单元，也是标准给信道质量回报用的分格单位：IEEE Std 802.11be-2024 §9.4.1.75 的 EHT CQI Report 字段给出每 20 MHz 九块，并明确把未定义的 26 音调 RU（RU 19、56、93、130）排除在回报之外。每格 2.03125 MHz 由 26 根音调与 78.125 kHz 的子载波间隔算出（§36 的 Table 36-18），源码里没有这个字面值。',
    '三种等分不出整数格的情形与标准音调表的对照出自 IEEE Std 802.11-2024 §27.3.2.2 的 Table 27-8（20 MHz）与 Table 27-9（40 MHz）：两个 106 音调资源单元各覆盖四格、四个 52 音调资源单元各覆盖两格，而 Table 27-8 的 NOTE 2 把中间那个 26 音调资源单元单独点出来。52+26 这类多资源单元分配出自 IEEE Std 802.11be-2024 §36.3.2.2.2。',
    '一片资源单元里再按空间分给几台，标准把它规定成一项具名、带能力位的特性（DL/UL MU-MIMO within OFDMA），并给了资源单元尺寸下限：HE 不小于 106 音调（IEEE Std 802.11-2024 §27.1 与 HE PHY Capabilities 的相应子字段），EHT 不小于 242 音调（IEEE Std 802.11be-2024 §36.1.1 与三条 Partial BW MU-MIMO 能力条款）。折成格就是最少四格与九格。',
    '按容量把各格折成一个有效信噪比、以及把成员那一份截到整数格，都是本仿真器的选择：标准不规定接收机怎么合成，也不规定调度器怎么分配资源单元。逐格偏差的分布沿用场景里 fading 那一节的取值（engine/fading.ts）。',
    '本课每一个数的量具都写在它旁边，断言在 tests/course/ru-diversity.test.ts；两腿的发布闸门在 tests/engine/selectivity-round.test.ts；位置不起作用那一条的标度无关形式（极差对标准误）在 tests/engine/selectivity.test.ts。',
  ],
  limits: [
    { kind: 'model-value', text: '把成员那一份截到整数格是本仿真器的规则，不是标准的条款：格数 = 整条信道的格数 × 这一份，再向下截到整数格，下限一格（engine/selectivity.ts 的 selMemberBins）。它站得住，是因为三种会出现的非整数情形与标准那张音调表逐个吻合——20 MHz 两个成员是两个 106 音调资源单元、各四格；20 MHz 四个成员是四个 52 音调资源单元、各两格；40 MHz 四个成员是四个 106 音调资源单元、各四格。而被截掉的那一格在引擎里就是不存在，而且不许笼统地说成「那一格」：20 MHz 两个成员丢一格（中间那个 26 音调资源单元），40 MHz 四个成员丢两格（26 音调 RU 5 与 RU 14），而 40 MHz 根本没有中间那一格——18 是偶数，直流落在 RU 9 与 RU 10 之间。真实调度器会把剩下的格分给别人，或者用 52+26 这样的多资源单元把它收进来。' },
    { kind: 'unmodelled', text: '各格是彼此独立的抽样，所以一个成员占信道的哪一段，在本仿真器里与它的判决无关：位置完全不起作用。这不是「影响很小」——各格独立而合成走的是无序平均，所以九格里六个四格窗口之间的真实差距精确为零；量出来那一点差距落在它自己的抽样标准误的量级里，所以它正是这次抽样自己的误差，不是一个效应。起始格在这里只为记录可读，以及为格间相关长度有取值的那一天留一个位置。真实信道的相邻格一起深一起浅，相干带宽是有限的，那时候靠边的一片与居中的一片就不是同一件事了。格间独立是频率分集偏多的那一边——而这句话推出来的方向要分成两半讲，因为两半相反。成员自己那一份付的代价被低估了：相干带宽有限时，它那一片里的有效样本比格数还少，它掉得比本课量到的更多。而本课那张表量的不是这个，是两腿之差，这个差被高估了：格一相关，格多的那一腿先塌，两腿的差距随相干带宽变宽一路缩小，相干带宽盖住整条信道时两腿都塌成一个有效样本、差距归零。真实住宅信道落在差距还明显存在的那一端，所以这张表的方向站得住；它的大小站不住。这两半都只有方向，没有数——格间相关长度本仿真器里没有取值，而给它一个取值就是发明一个标准没有的物理量。' },
    { kind: 'unmodelled', text: '误包率在这里与帧长无关：判决是逐一次发送的一个硬门限（信干噪比与这一级速率的灵敏度门限比一下，channel.ts 的 decodeThreshDb 只读速率，不读字节数），所以一次发送要么整个解出来、要么整个解不出来，装了多少载荷都一样。这件事正好偏向本课那张表的一边：关掉分片的那一腿每条接收扛的是一个两帧聚合、2870 字节，而成员那一腿每个成员只扛 1434 字节，两者占的空口时间却几乎相同（2.727 对 2.731 ms）。于是整条九格那一腿在本仿真器里「免费」多扛了一倍载荷，表里那 8 个百分点的差距因此被抬高了一点。真实接收机的长帧误包率更高，所以真实的差距比表里更小——但方向不变。', },
    { kind: 'threshold', text: '合成用的是容量，而真实接收机达不到容量，所以本课印的每一个损失都是下界：真实的损失更大，掉帧也更多。这不是上面那条格间相关的另一种说法，两件事要分开记：那一件是本仿真器不需要的一个数（位置在这个模型里真的无关），这一件是本仿真器明确拒绝去发明的一个数——指数有效信噪比映射（exponential effective SINR mapping, EESM）要为每一级调制与码率各配一个 β 系数，而标准从未给过 β，于是这里宁可给一个说得清的下界。而它在本课有一个方向：一个真实的码离容量这个上界有多远，取决于它能摊在几个彼此独立的衰落上，摊得越少，按容量算出来的那个数就越乐观——所以成员那一份越薄，这个下界离真实越远。于是真实的尾部代价比本课量到的更大，而这是本课唯一一条把那张表的差距往大处推的机理：上面两条（格间相关，以及判决不读帧长）都把它往小处推。三条都没有取值可量，所以三条都只能是方向，不是数。' },
    { kind: 'model-value', text: '资源单元在这里仍然只有一种尺寸——成员数的倒数，再截到整数格（mac.ts 的 frac = 1 / 成员数）。标准的资源单元是一张离散的音调表（26、52、106、242、484、996……），调度器可以给积压多的成员一块大的、给只有一个小帧的成员一块 26 音调的，也可以留几块空着；选哪一种是调度器的事，而标准不规定调度器。所以这一课算的是「分到的格少了会怎样」，不是「调度器该怎么分」——后者要发明一条资源单元选择规则，而那会是一个比等分更大、而且没有出处的模型取值。' },
    { kind: 'out-of-scope', text: '同组互不干扰仍然是按定义给的：引擎把一次多用户发送的各份标成同一个 orthogonalGroup，凡同组就不计入彼此的干扰（channel.ts）。而逐格这一路只改信号这一侧，干扰与噪声在每一格里是同一个数。所以不要拿这一课去问「两个成员之间的泄漏」——相邻资源单元之间的保护音调与泄漏在这里一个都没建。还有一句要先说清，否则格号会被读成设备的编号：格号区间属于那一片资源单元，不属于某一台设备。标准允许在一片资源单元里再按空间分给几台，给了它名字和能力位，还给了尺寸下限（HE 不小于 106 音调、EHT 不小于 242 音调，折成格是最少四格与九格），那时候几台会共用同一段格号而各自独立地抽各自的衰落。本仿真器把按频率划分与按空间划分做成互斥的（mac.ts），所以这种情形一次也不会出现，细节在 mumimo-choose 那一课。' },
    { kind: 'out-of-scope', text: '成员那一份的格数只进到解调这一步：合成发生在锁定之后（channel.ts 的 resolveLock），而载波侦听、前导检测与捕获效应（capture effect）读的仍然是整条信道那一次平坦抽样，发送端选哪一级速率读的甚至不是这一帧的抽样——是链路表里那一个静态的均值电平（simulation.ts 的 mcsForPeer，它自己的注释写着理由：帧还不存在的时候就要定级，发送端不可能知道这一帧会怎么衰落）。4a 记过一次这样的不对称，这一刀让它再多一层：成员的解调读它那一片的格，而它的选级读整条信道的那一个值。这一层要紧，因为读者看完那张表就会问「成员真只读四格，速率环为什么不降一档把它补回来」。本课场景的答案是「速率已经钉在最低一级」，而那只在这个场景上成立；换一个不卡在最低一级的场景，速率环确实会动，但它动的依据是这条链路连续两次失败（engine/rate.ts），不是成员那一片有多薄：它永远先掉两帧再降一档，而降档改的是整条链路这一级，分不出「这一片薄」与「这条链路差」。所以不要把这一课的结论读成「速率控制会替成员把这笔代价吸收掉」。' },
    { kind: 'out-of-scope', text: '这一课只能是下行的，而拦住上行的不是这一刀造的东西。上行那一片的份额现在确实写在被触发的那一帧上了，可是触发式应答用哪一级速率，取的是 cfg.mcsForPeer——接入点对那台设备的下行速率环；而 closeTbPpdu 一次也不调 onTxOutcome（engine/rate.ts 的文件头自己记着「上行多用户两边都不回报」），所以给上行应答定速率的那个闭环从来没有闭合过。接入点发 20 dBm、站点发 15 dBm，于是那一级速率是按比它高 5 dB 的那条路挑出来的。后果是上行的余量不受速率环摆布，它要么太宽、要么为负，而本课的闸门两边都不成立：量出来 ofdma-ul 那个场景上行成员的余量是 12.195 dB，80 条接收一条也没掉（量具：那一课的场景加上 fading 与 selectivity 两节，1000 ms，上行成员那一侧）。所以不要拿本课的结论去读上行多用户的掉帧。' },
  ],
  scenario: () => ruDiversityScenario(),
  variants: [
    { label: '两个成员（各四格）', scenario: () => ruDiversityScenario(true) },
    { label: '分片关掉（整条九格）', scenario: () => ruDiversityScenario(false) },
  ],
  jumps: [
    J('第一次装两个成员的下行发送', firstMuDl),
    J('第一条带着份额的合成记录', (r) => r.type === 'WIFI_SEL' && r.ruFraction !== undefined),
    J('第一次没解出来的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    `跳到第一条带着份额的合成记录：末尾写的是 over bins 0–${selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}, its 1/2 of the channel，而另一台电视那一行是 bins ${selMemberBins(20, 1 / 2)}–${2 * selMemberBins(20, 1 / 2) - 1} of ${selBins(20)}——哪台拿前一段并不固定，成员次序跟着队列（queue）里的先后走。同一行前面那三个读数是 mean、worst bin 与 effective，而这一整轮 292 条下行接收里只有 1 条写着 over ${selBins(20)} bins：那是整轮唯一一次没有编成组的发送。这一整行比窄屏宽得多，loss 与 over 后面那两段都在后半截，窄屏上要把这一行往右拉才看得到。`,
    '再盯住同一行的 loss 和紧跟它的那条接收结果（还是要往右拉的那后半截）。loss 多半在 2 dB 上下，偶尔是负的（合成之后比均值还好），偶尔深到十个分贝以上；深的那几次后面跟的就是解不出来的接收。切到「分片关掉」那个变体再看一遍：loss 的中位数反而更高一点，而很深的那几次少了。',
  ],
  tryThis: [
    '在本课的两个变体之间来回切。「分片关掉」是同一个户型、同一组位置、同一个种子、同一条链路，唯一变的是每次接收读 4 格还是读 9 格，而两腿的余量是同一个浮点数——这正是前一课的「把 OFDMA 关掉」那个实验，换个问题问一遍：这一次要看的不是省了多少空口，而是同一个余量下掉帧的比例从 18.12 % 涨到 26.24 %。',
    '点「在编辑器中打开」，在卧室里再放一台同样的电视，重新载入。编组会整个散掉：1000 ms 里 349 次下行发送一次也没装两个成员，三个成员的那一组一次也编不出来。原因在空口时间上——份额越小、资源单元越窄，同样的字节要占越长的空口，而在最低一级速率上一包视频装在三分之一片里就超过了一次发送的时长上限。所以「切得更薄会更糟」这条链条，在这个场景上只能算到二分之一为止。',
  ],
  quiz: [
    {
      q: '同一个余量组里，四格那一腿掉帧更多，可它最深那一格反而比九格那一腿更浅。这两件事矛盾吗？',
      options: [
        '矛盾：掉帧更多就说明它遇到的格更深',
        '不矛盾：判决读的是各格折成的有效信噪比，而格数少了之后这个合成值的起伏更大，深的那一头因此更深',
        '不矛盾：最深那一格会被均衡器补回来，所以它和掉帧无关',
      ],
      answer: 1,
      explain: '格数是取平均的项数：项数少，平均值的起伏就大，两头一起张开。最深那一格是抽样次数的函数，抽得少就浅；而掉帧看的是合成值深的那一头，它反而更深。',
    },
    {
      q: '前一课那个场景里也有两台电视编在同一次发送里，而把这两节打开之后，它那一轮的余量中位数是 15.4 dB。把本课这张表搬到那个场景上去讲，会怎样？',
      options: [
        '差距会变得更大，因为那条链路更好',
        '两腿都几乎不掉帧，差距塌成并列的零——读者在自己屏幕上看不到这一课要讲的事',
        '完全不变：掉帧率已经除过接收条数了',
      ],
      answer: 1,
      explain: '除以接收条数解决的是「两轮发的次数不一样」，解决不了「两腿都是零」。余量宽到十五个分贝，格数少掉一半也改不了任何一次判决——所以这一课要自己建一个余量落在窗口里的场景，而不是挂在前一课后面多写一段。',
    },
  ],
}
