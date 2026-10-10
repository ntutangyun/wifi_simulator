/**
 * Wi-Fi Tier 4 · M13 · 草案里的 Wi-Fi 8 · the finer rate ladder, and the trade it is.
 *
 * **The first lesson of the course's fourth tier, and the first Wi-Fi lesson checked against a
 * draft.** `TIERS[3].basis` gains `p802-11bn` with it, which is what puts the amber basis line on
 * the panel and 「草案，内容可能变动」 inside the lesson; `teachesDraft` reads the DECLARED list
 * and never `citedBases`, so that declaration is explicit rather than inferred. This slice adds
 * no engine code: `'uhr'`, the eighteen-rung ladder and `UHR_SFD_MCS` landed with slice W12a
 * (`tests/engine/uhr-ladder.test.ts`, `tests/engine/uhr-round.test.ts`).
 *
 * **The spine is the trade, not the window table.** W12a measured what the four new rungs are
 * worth and the answer came in three parts; this lesson is built on all three rather than on the
 * first:
 *
 *  1. how many rungs a ladder has is a design choice, and four new ones can only go in the
 *     MIDDLE — `mcsForRssi` takes the highest index whose requirement fits, so the array has to
 *     rise monotonically in sensitivity AND in N_DBPS or a high-SNR link picks a slower rung;
 *  2. at a FIXED position the finer ladder really does reach one rung higher, and the goodput it
 *     wins is exactly the ratio of the two rungs' N_DBPS — +6.71 %, +11.11 % and +33.33 % in
 *     this flat, against 1.0667 / 1.1111 / 1.3333 computed off the ladder itself;
 *  3. and once the level moves it hands most of that back. At the narrow top window this flat
 *     measures −0.04 % with the slow layer alone and −0.03 % with both, 8 and 10 of 20 seeds
 *     better — a coin flip. **That zero is the number this lesson is for, because it points the
 *     opposite way from what the table predicts.**
 *
 * So the window table is printed as what it is — an upper bound a reader will not meet — and the
 * lesson's last word is the trade: a finer ladder pays where the channel moves slowly against
 * the rate controller and does not pay where it moves fast.
 *
 * Every figure below is pinned in tests/course/uhr-rate-ladder.test.ts: the deterministic ones
 * (link levels, selected rungs, window widths on the floor, fixed-position goodput, record
 * counts) exactly, and every faded figure as a mean over twenty seeds whose threshold survived a
 * sweep out to sixty. **A single faded run is not a legal measurement on this lesson's subject,
 * and the lesson says so in its own prose**: at the 「客厅中段」 spot, with shadowing on, seed 2
 * gives +6.9 % and seed 17 gives −9.7 %.
 *
 * On the two numberings: the draft calls the four new rungs MCS 17 / 19 / 20 / 23, and this
 * engine's `'uhr'` indices for them are 2 / 5 / 7 / 11. **The prose uses the engine index**,
 * because the engine index is what the timeline prints (`FrameDetail.tsx` renders `MCS ${f.mcs}`),
 * and the draft's own numbers appear as provenance in `sources`. The one table that needs both
 * carries both columns side by side, and the lesson spends a paragraph on the collision that
 * makes the distinction load-bearing: index 7 is 64-QAM 5/6 on the old ladder and 16-QAM 5/6 on
 * the new one.
 */
import { type Lesson, J } from '../lessonKit'
import { uhrLadderScenario } from '../wifiScenes'

export const uhrRateLadder: Lesson = {
  id: 'uhr-rate-ladder',
  module: 13,
  title: '十八档的速率阶梯——细一档真能多抬一级，而电平一起伏它就全还回去',
  why: '到这里为止，这门课量过的每一个速率都来自同一条阶梯：Wi-Fi 7 在 20 兆赫单流上的十四档。Wi-Fi 8 的草案往这条阶梯里又塞了四档，变成十八档——而且是塞在中间，不是接在顶上。纸面上它只往一个方向走：同一个位置上，细阶梯能够到的那一档比粗阶梯高一档，多出来的吞吐恰好等于两档每符号（symbol）数据比特数之比，这间房里是 +6.7 %、+11.1 % 与 +33.3 %。这一课会把它算到最后一位，然后把它拆掉——因为它是一个读者达不到的上界，不是结论。三个窗口在地板上分别只有 0.25、1.45 与 0.60 米宽；而一旦让接收电平起伏起来，+33.3 % 缩到 +11.8 %，+6.7 % 一分不剩。',
  outcomes: [
    '说出四个新档在十八档阶梯里的位置，以及它们为什么只能交错插进中间',
    '在同一间房的四个位置上读出两条阶梯各自选中的那一档，并验证定点上的吞吐差恰好等于每符号数据比特数之比',
    '说出把那张窗口表吃掉的三件事，并指出全组里唯一一个方向与它相反的数',
  ],
  needs: ['mcs-ladder', 'rate', 'rate-fallback', 'fading'],
  terms: [
    { term: 'N_DBPS', plain: '每符号数据比特数：一个符号里装的数据比特数，等于 234 个数据子载波（sub-carrier）× 每子载波比特数 × 编码率（coding rate）。本仿真器那张速率表就是它除以每符号时长' },
    { term: 'mandatory MCS', plain: '必选的那几档：草案要求每台设备都得支持的档。四个新档由 Motion #216 定为必选，而同一条动议留了一个例外——256-QAM 2/3 对只支持 20 兆赫的设备是可选的' },
    { term: 'log-normal shadowing', plain: '对数正态阴影：本仿真器给整条链路加减的一个正态随机分贝数，在一段相干时间里保持不变。它是起伏里慢的那一层，快的那一层是按每一帧单独抽的瑞利衰落' },
  ],
  picture: [
    { heading: '十四档变十八档，而四个新档只能插在中间', text: '草案给这条阶梯添了四个调制与编码方式（modulation and coding scheme, MCS）是 QPSK（quadrature phase-shift keying）2/3、16-QAM（quadrature amplitude modulation）2/3、16-QAM 5/6 和 256-QAM 2/3——每一档就是一种调制（modulation）配一个码率。它们不是四个更快的档，而是落在已有十四档中间的四个空隙里。为什么不能直接追加到数组末尾：本仿真器挑档的办法是「取所需信噪比（signal-to-noise ratio, SNR）容得下的最高索引」，所以这条数组必须随索引单调上升，否则信号一好它反而会挑一个更慢的档。于是十八档按灵敏度（sensitivity）交错排开，而排完之后灵敏度与每符号数据比特数双双严格递增，一处倒挂也没有。代价是本引擎的索引不再等于草案的档号。',
    },
    { heading: '一个窗口在地板上有多宽', text: '所谓「窗口」是指：接收电平落在哪一段时，细阶梯选得到的那一档粗阶梯选不到。四个新档里有三个只给自己留了 1 分贝的灵敏度间隔，只有 16-QAM 5/6 占了 3 分贝。而这门课把这件事换成了读者能走过去的距离：本仿真器的路径损耗（path loss）指数是 3.0，所以同样的 1 分贝在三米处是 0.25 米，在八米处是 0.60 米——端着笔记本挪一步就走出去了。',
    },
    { kind: 'watch', jump: 0, heading: '去看这一轮用的是哪一档', text: '载入这一课的场景——书房里的路由器，客厅中段那台一直在上传的笔记本，两端都是 Wi-Fi 8——跳到第一帧数据，读帧详情里的那一行：模式 uhr、MCS 7。再把变体切到「Wi-Fi 7 · 同一位置」：同一个位置、同一张家具，这一次是 eht、MCS 4。两个数都是引擎索引，而时间轴上打出来的就是引擎索引；草案管这两档叫 MCS 20 和 MCS 4。',
    },
    { kind: 'steps', heading: '那一档是怎么被吃掉的——一步一步', items: [
      '本仿真器按链路（link）的平均电平定上限：电平进 `mcsForRssi`，出来一个索引，速率控制再从那个上限往下找。电平不动的时候，细阶梯的上限确实高一档，而这一档就是全部的收益。',
      '打开慢的那一层（对数正态阴影，σ = 4 分贝、相干时间 100 毫秒），电平开始在窗口之间游走。细阶梯踩到的档更多——同一次游走里它踩过四档，粗阶梯只踩过两档——可窗口只有 1 到 3 分贝宽，所以它待在新档上的时间只是其中一小部分。',
      '再打开快的那一层（按每一帧抽的瑞利衰落），上限按均值定而每一帧各自衰落，于是被抬高的那一档失败得更勤：二十个种子加起来，两条阶梯的接收失败数在每一种设置下都是细阶梯更高。',
      '而降档要两次连续失败、一次只退一个索引，十八档比十四档要多走几步才掉得下来。三件事合起来就是这一课的结论。',
    ] },
    { heading: '所以这一课是三句话', text: '一条阶梯有多少档是一个设计选择；只按平均电平定上限时，细阶梯确实把上限抬高一档，赚到的恰好是那张表上的算术；而电平一起伏，它在最窄的那个窗口上一分不剩。还要补一格反方向的砝码：把笔记本搬到路由器旁边的桌上，两代设备的时间轴逐条相同——两万零一百二十二条记录，只有「模式」和「MCS」两个字段不同。在那一格里，一台 Wi-Fi 8 设备就是一台改了名的 Wi-Fi 7 设备。',
    },
  ],
  numbers: [
    { kind: 'table', heading: '四个新档，以及它们各自顶掉的那一档（20 兆赫、单流）', head: [
      '引擎索引', '草案档号', '星座与码率', '灵敏度', 'N_DBPS', '顶掉的档',
    ], rows: [
      ['2', 'MCS 17', 'QPSK 2/3', '−78 dBm', '312', '1（234）'],
      ['5', 'MCS 19', '16-QAM 2/3', '−71 dBm', '624', '3（468）'],
      ['7', 'MCS 20', '16-QAM 5/6', '−69 dBm', '780', '4（702）'],
      ['11', 'MCS 23', '256-QAM 2/3', '−60 dBm', '1 248', '7（1 170）'],
    ] },
    { heading: '这两列档号有一处会咬人', text: '左边那列是本引擎的索引，也是时间轴和帧详情里打出来的那个数；右边那列是草案给这四档的编号。咬人的地方是：同一个数字「7」在粗阶梯上是 64-QAM 5/6（1 170），在细阶梯上是 16-QAM 5/6（780）。所以比较两条阶梯时能比的是每符号数据比特数，不是索引。',
    },
    { kind: 'table', heading: '这间房的四个位置，定点实测（600 毫秒，笔记本一直在上传，同一个随机种子）', head: [
      '笔记本在哪', '距离 · 电平', 'Wi-Fi 7', 'Wi-Fi 8', '吞吐',
    ], rows: [
      ['书房桌上', '1.41 m · −36.22 dBm', '13（2 340）', '17（2 340）', '140.740 → 140.740 Mb/s'],
      ['墙后一步', '3.35 m · −59.46 dBm', '7（1 170）', '11（1 248）', '73.920 → 78.880 Mb/s'],
      ['客厅中段', '6.08 m · −67.22 dBm', '4（702）', '7（780）', '44.100 → 49.000 Mb/s'],
      ['客厅深处', '7.81 m · −70.49 dBm', '3（468）', '5（624）', '29.400 → 39.200 Mb/s'],
    ] },
    { kind: 'formula', heading: '定点上那三个差就是算术本身', text: '1248 / 1170 = 1.0667、780 / 702 = 1.1111、624 / 468 = 1.3333；实测吞吐比是 1.0671、1.1111、1.3333。', note: '能逐位对上，是因为两条阶梯的每符号空口时间（airtime）逐位相同：草案没发布 Wi-Fi 8 的前导码（preamble）长度、离散傅里叶变换周期和保护间隔枚举，本仿真器就把这三个常数焊在 Wi-Fi 7 的值上并声明了。于是这个对照只在量阶梯。定点上也没有随机性可言——档是电平的函数，电平是几何的函数，一条跑满的单站链路没有东西可碰撞。' },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 26.8 },
      caption: '前面读过的那条十四档阶梯，标记停在「客厅中段」那台笔记本的信噪比上，点亮的最高一级是索引 4。细阶梯在 4 和 5 之间还多一档，而这个控件里没有它：一条草案阶梯不进已发布课程的控件。' },
    { kind: 'table', heading: '打开起伏之后（二十个种子的均值，300 毫秒；括号里是二十个里 Wi-Fi 8 更好的个数）', head: [
      '位置', '窗口宽', '定点', '只开阴影', '阴影＋按帧瑞利',
    ], rows: [
      ['墙后一步', '1 dB', '+6.71 %', '−0.04 %（8/20）', '−0.03 %（10/20）'],
      ['客厅中段', '3 dB', '+11.11 %', '+8.18 %（19/20）', '+6.73 %（15/20）'],
      ['客厅深处', '1 dB', '+33.33 %', '+20.12 %（19/20）', '+11.78 %（14/20）'],
    ] },
    { heading: '这张表里最该读的是第一行那个零', text: '「墙后一步」是 256-QAM 2/3 那一档的窗口，1 分贝宽、地板上 0.25 米宽，定点上值 +6.71 %。而只要电平开始动它就一分不剩：均值 −0.04 %，二十个种子里只有八个是 Wi-Fi 8 更好。这个数和那张窗口表预言的方向相反，而它不是噪声——两条阶梯的接收失败数在这一格里是 32 对 135：细阶梯把档抬了上去，然后更频繁地解不开。另外两行也都比表上的数小，中间那一行小得最少，因为它的窗口有 3 分贝宽，是四个新档里唯一一个。',
    },
    { heading: '为什么这两列都不能只跑一次', text: '同一个位置、同一条阶梯、只换随机种子：开阴影之后种子 2 是 +6.9 %，种子 17 是 −9.7 %。所以这一课的每个起伏数字都是二十个种子的均值，阈值又在六十个种子上复核过。',
    },
  ],
  deeper: [
    { heading: '为什么不能把四档接在阶梯顶上', text: '因为那会把慢档摆到快档上面。追加之后索引 14…17 会是 QPSK 2/3、16-QAM 2/3、16-QAM 5/6、256-QAM 2/3，而索引 13 已经是 4096-QAM 5/6；挑档的规则是「取容得下的最高索引」，于是一条信号极好的链路会挑到索引 17 的 256-QAM 2/3，比它本来跑得到的慢将近一半。按灵敏度交错插入是这件事的唯一解，而它之所以安全，是因为交错之后灵敏度与速率两条序列都仍然严格递增——这一点是量出来的，不是推出来的。' },
    { heading: '两条阶梯的 4096-QAM 不在同一个索引上', text: '编辑器里那个「4096-QAM」复选框一旦关掉，本仿真器就把上限压到这一代最低的那个 4096-QAM 档再减一。Wi-Fi 7 上那个索引是 12，Wi-Fi 8 上是 16，而两者都正好是各自阶梯的倒数第二档。那个复选框的标签以前写着「MCS 12/13」，而一个 Wi-Fi 8 节点今天就能勾它——所以标签已经改成了一句对两代都真的话。' },
  ],
  sources: [
    '四个新档出自 TGbn 的规范框架文稿 11-24/0209r19：添加这四个调制与码率组合的是 Motion #42，把它们定为必选的是 Motion #216（同一条动议写明 256-QAM 2/3 对只支持 20 兆赫的设备是可选的）。草案给它们的编号 17 / 19 / 20 / 23 出自 Motion #313 的发射星座误差一节（取值 −12 / −18 / −20 / −29 dB）与 Motion #417 的灵敏度表。',
    '四个新档的接收灵敏度 −78 / −71 / −69 / −60 dBm 出自同一份文稿的 Motion #417，20 兆赫那一列。那张表只有 11 行，其中 7 行是本仿真器已有的档（−79 / −77 / −74 / −70 / −66 / −64 / −59 dBm），逐行与引擎的取值一致；MCS 0、6、9–13 不在那张表里。P802.11bn 是未批准的草案，条号与取值都还可能变动。',
    '每符号数据比特数的算法与 20 兆赫 234 个数据子载波出自 IEEE Std 802.11-2024 第 17 与第 27 章的参数表；本仿真器对十八档逐档验算过 234 × 每子载波比特数 × 编码率都是整数。',
    '三个模型取值，草案没给、也没有被冒充成草案给的：挑档时在所需信噪比之上留的 3 分贝余量、阴影的 σ = 4 分贝与 100 毫秒相干时间、以及按帧抽取的瑞利衰落。Wi-Fi 8 的前导码长度 48 微秒、每符号 13.6 微秒与多用户附加前导 4 微秒是直接复用 Wi-Fi 7 的值并声明了的——草案没有发布这三个数。',
  ],
  limits: [
    { kind: 'model-value', text: '挑哪一档这件事标准不管，本仿真器选的是「取所需信噪比容得下的最高索引，并留 3 分贝余量」，降档要两次连续失败、一次退一个索引，升档要十次连续成功。这一整套都是本仿真器的速率控制，不是草案正文。而这一课的结论对它极其敏感：换一个按每帧信噪比而不是按平均电平定上限的算法，细阶梯在快衰落下未必还是一分不剩。所以「细阶梯在信道走得快的地方不付钱」是这套算法下的结论，不是一条可以搬去评价真实芯片的判断。' },
    { kind: 'threshold', text: '这一课的三个位置是刻意摆的：按 5 厘米一格扫过整间客厅找出来的，三个窗口在地板上分别是 0.25、1.45 与 0.60 米宽。换一间房、换一道墙，这三个位置全都要重新找，而「找」的办法必须是读时间轴里真正选中的那一档，不能是算信噪比——这个测量第一次做的时候算的是路由器发、笔记本收那个方向的预算，而业务跑的是反方向，笔记本因此被摆在离目标窗口 5 分贝的地方，量出来的结论是「两条阶梯完全一样」。' },
    { kind: 'unmodelled', text: '本仿真器的小尺度衰落是按（种子、发端、收端、帧键）做的纯哈希，不是一条随时间相关的游走——这正是它可复现的来源。所以「接收电平在窗口之间慢慢漂」这件事在这里只能由阴影那一层表达，而阴影的键是相干时间。真实信道里快慢两层是同一条相关过程的两端；这里它们是两个独立的开关。一条真正时间相关的小尺度游走，这个引擎还没有。' },
    { kind: 'out-of-scope', text: '草案里 Wi-Fi 8 的其他机制，这一课一件也没碰：multi-access-point coordination、non-primary channel access、coordinated beamforming，以及把 4096-QAM 用进不等调制的那一条。本仿真器给 Wi-Fi 8 开的能力和 Wi-Fi 7 一模一样，多出来的只有这四档速率——所以不要拿这一课去估计 Wi-Fi 8 整体会快多少，它量的是十八档对十四档这一件事。' },
    { kind: 'threshold', text: '这四档在草案里是必选的，而 Motion #216 自带一个例外：256-QAM 2/3 对只支持 20 兆赫的设备是可选的。本仿真器那张速率表存的就是 20 兆赫那一列，所以严格按草案的口径，这一课「墙后一步」那一格用的档在一台 20 兆赫设备上并不保证存在。引擎按乐观的那一端把它建了出来——而那一格的实测结果恰好是零，所以这个乐观没有换来任何被高估的收益。' },
  ],
  observe: [
    '在这一课自己的场景里只读两个数：帧详情里的模式是 uhr、MCS 是 7，整轮一个例外也没有。切到「Wi-Fi 7 · 同一位置」是 eht、MCS 4，同样一个例外也没有。两边的吞吐是 49.000 对 44.100 Mb/s。',
    '在「书房桌上」那两个变体之间来回切，找一处不同：找不到。两边同样的空口时间、同样的两万零一百二十二条记录，只有模式与 MCS 两个字段的字面不同。',
    '在「Wi-Fi 8 · 开阴影」里数一数一轮里出现过几个不同的 MCS：四个（4、5、6、7）。切到「Wi-Fi 7 · 开阴影」再数：两个（3、4）。细阶梯踩的档确实更多——而这一次它赢 6.9 %，换成种子 17 它输 9.7 %。',
  ],
  tryThis: [
    '把「Wi-Fi 8 · 开阴影」和「Wi-Fi 7 · 开阴影」的随机种子都改成 17 再各跑一次：Wi-Fi 8 从 39.76 掉到 32.72 Mb/s，而 Wi-Fi 7 守在 36.24，于是这一格里细阶梯输掉 9.7 %。再看两边的接收失败数：18 对 8。',
    '把笔记本从「客厅中段」往客厅深处推 1.0 米（到离路由器 7.0 米），再比一次两条阶梯：窗口过去了，两边落到同一档（每符号 702 比特），差回到零。窗口其实在 6.9 米处就已经关上了。再往回推到 6.0 米，差又回来。那 3 分贝的窗口在地板上一共 1.45 米宽，而它是四个新档里最宽的一个。',
  ],
  quiz: [
    {
      q: '为什么草案添的四个档在本引擎里不能直接追加到十四档数组的末尾？',
      options: [
        '因为数组长度写死在类型里，加不进去',
        '因为挑档的规则是「取容得下的最高索引」，追加会让信号最好的链路挑到一个慢档',
        '因为草案给它们的编号是 17/19/20/23，必须按那个编号排',
      ],
      answer: 1,
      explain: '追加之后索引 17 会是 256-QAM 2/3，而索引 13 已经是 4096-QAM 5/6，于是一条极好的链路会挑到索引 17，比它本来跑得到的慢将近一半。交错插入之后两条序列都严格递增，这才是它安全的原因。',
    },
    {
      q: '「墙后一步」那个位置上，定点实测细阶梯快 6.71 %，而打开起伏之后均值是 −0.04 %。最贴近机理的解释是哪一个？',
      options: [
        '起伏让两条阶梯的空口时间不再相同，所以对照不成立了',
        '上限按平均电平定，而每一帧各自衰落：被抬高的那一档更频繁地解不开，这一格的接收失败数是 32 对 135',
        '阴影的 σ 太大，把两边都压到了阶梯底部，所以差被抹平了',
      ],
      answer: 1,
      explain: '两条阶梯的每符号空口时间是焊在一起的，所以第一项不成立；底部也没被压平——同一次游走里细阶梯踩过四档。真正发生的是上限按均值定而帧按帧衰落，加上降档要两次连续失败、一次只退一个索引。',
    },
  ],
  scenario: () => uhrLadderScenario('uhr', 'mid'),
  variants: [
    { label: 'Wi-Fi 7 · 同一位置', scenario: () => uhrLadderScenario('eht', 'mid') },
    { label: 'Wi-Fi 8 · 书房桌上', scenario: () => uhrLadderScenario('uhr', 'desk') },
    { label: 'Wi-Fi 7 · 书房桌上', scenario: () => uhrLadderScenario('eht', 'desk') },
    { label: 'Wi-Fi 8 · 墙后一步', scenario: () => uhrLadderScenario('uhr', 'near') },
    { label: 'Wi-Fi 7 · 墙后一步', scenario: () => uhrLadderScenario('eht', 'near') },
    { label: 'Wi-Fi 8 · 客厅深处', scenario: () => uhrLadderScenario('uhr', 'far') },
    { label: 'Wi-Fi 7 · 客厅深处', scenario: () => uhrLadderScenario('eht', 'far') },
    { label: 'Wi-Fi 8 · 开阴影', scenario: () => uhrLadderScenario('uhr', 'mid', 'shadow', { seed: 2 }) },
    { label: 'Wi-Fi 7 · 开阴影', scenario: () => uhrLadderScenario('eht', 'mid', 'shadow', { seed: 2 }) },
    { label: 'Wi-Fi 8 · 阴影＋瑞利', scenario: () => uhrLadderScenario('uhr', 'mid', 'both', { seed: 2 }) },
    { label: 'Wi-Fi 7 · 阴影＋瑞利', scenario: () => uhrLadderScenario('eht', 'mid', 'both', { seed: 2 }) },
  ],
  jumps: [
    J('第一帧数据', (r) => r.type === 'TX_START' && r.frame.kind === 'data'),
    J('第一个聚合', (r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.ampdu !== undefined),
    J('第一次抽签', (r) => r.type === 'BACKOFF_DRAW'),
    J('第一次收妥', (r) => r.type === 'RX_OK' && r.frame.kind === 'data'),
  ],
}
