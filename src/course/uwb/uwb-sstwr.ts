/**
 * UWB Tier 1 · M14 两个时钟 · The clock inside the reply time.
 *
 * Why a reply time measured on the other radio's crystal makes the range too
 * long, how the error grows with the slot the anchor answered in, and what the
 * standard's clock-offset correction does and does not remove.
 *
 * The scene is unchanged: the phone runs 10 ppm fast, every anchor 10 ppm slow,
 * and the four anchors answer in four different slots, so one round shows the
 * same 3.50 m measured four times with four different errors.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M14). It **stays whole** — §2 keeps five UWB lessons whole deliberately,
 * because a ramp without its correction leaves the reader with a defect and no
 * fix — and it sheds padding instead:
 *  - §4 gives it a `timing` figure, Tround 与 Treply 画在两个时钟上，四个时隙上的
 *    斜坡. It replaces prose: 「等得越久，谎话越大」 is gone entirely (§5.2 deletes
 *    that metaphor, and the figure's four bars ARE the ramp), and the opening of
 *    「出问题的是等待，不是飞行」 — the two-clocks narration — is now the caption's.
 *  - §5.1 · 9 moves the Figure of Merit byte out: `uwb-nlos` is to be its single
 *    home, so the depth paragraph that decoded 0x16 bit by bit is deleted. Step 7
 *    still *names* the byte, because what it says there is that the record
 *    carries a FoM and never an error bar, which is this lesson's own claim; the
 *    decode's pins now guard the engine (`fomDecode`, `fomText`) alone and are
 *    waiting for `uwb-nlos` to claim the sentences.
 *  - §5.3 deletes the depth's 「手机减掉的那个数」, which re-printed the worked
 *    table directly above it, and trims 「剩余误差有多大」 to the two things the
 *    table does not say: the 0.2 ppm the correction swaps 20 ppm for, and the
 *    3.0 cm a millisecond of waiting still costs.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-sstwr.test.ts.
 * `npx tsx scripts/lesson-dump.ts uwb-sstwr` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { J, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The fourth range of the round: the anchor that answers in slot 4. */
const fourthUwbRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE' && r.peer === 'anchor-4'

/**
 * Four anchors on a 3.50 m ring around a phone at the centre of a 10 × 8 m lab,
 * every device at the same 2.20 m height so all four true distances are exactly
 * 3.50 m. The only thing that differs between the four ranges is the slot the
 * anchor answers in — which is the whole point of the scene.
 */
export function uwbSstwrScenario(ppm: { tag: number; anchors: number }): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2, ppm.anchors),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2, ppm.anchors),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2, ppm.anchors),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2, ppm.anchors),
    uwbTag('tag-1', 'Phone', 5, 4, 2.2, ppm.tag),
  ], { method: 'ss', nlos: false })
}

/**
 * The instants of the round in microseconds, as the timeline puts them: the Poll
 * leaves at 0, each anchor answers at the top of its own 2 ms slot, and every
 * arrival is 11.675 ns of air later. Every value is read back out of the run in
 * tests/course/uwb-sstwr.test.ts, so the figure cannot drift from it.
 */
export const FIG = {
  pollTx: 0, pollTxEnd: 206.859,
  /** Slot i starts at i × 2000 µs; the answer is 187.372 µs long and lands 12 ns later. */
  slotUs: 2000, respUs: 187.372, flightUs: 0.012,
  windowUs: 8400,
  /** The raw error of each anchor's range, as the table's last column prints it. */
  rawErrM: ['+6.01 m', '+11.97 m', '+17.99 m', '+23.92 m'],
} as const

/**
 * Tround and Treply on two clocks, and the ramp. The grey bar of each anchor
 * lane IS its reply time — from the Poll's arrival to its own answer — and the
 * four bars grow one slot at a time, which is the whole lesson in one picture:
 * the geometry is identical on all four lanes and only the waiting differs.
 * Drawn to scale, so the flight the round is after (11.675 ns) is invisible
 * beside the wait, which is exactly why the error lands on the wait.
 */
export function uwbSstwrTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '手机 tag-1', spans: [
        { label: '发 Poll', fromUs: FIG.pollTx, toUs: FIG.pollTxEnd, tone: 'accent' },
        ...[1, 2, 3, 4].map((i) => ({
          fromUs: i * FIG.slotUs + FIG.flightUs,
          toUs: i * FIG.slotUs + FIG.flightUs + FIG.respUs,
          tone: 'accent' as const,
        })),
      ] },
      ...[1, 2, 3, 4].map((i) => ({
        label: `锚点 ${i}`,
        spans: [{ label: FIG.rawErrM[i - 1], fromUs: FIG.flightUs, toUs: i * FIG.slotUs }],
      })),
    ],
    axis: { fromUs: 0, toUs: FIG.windowUs, ticks: [0, 4000, 8000], unit: 'µs' },
  }
}

export const uwbSstwr: Lesson = {
  id: 'uwb-sstwr',
  module: 15,
  title: '应答时间是用对方的时钟测量的',
  why: '前面几课假设两台设备的时钟都完全准确，现实中没有这样的设备：石英晶振（crystal）的频率总会偏高或偏低，偏差以百万分之几（ppm）计。两端各自对自己的两次读数相减，未知的起点被消去，速率误差却无法消去：手机测量的往返时间按手机的时钟缩放，锚点（anchor）测量的作答时间按锚点的时钟缩放，而交互中最长的正是锚点等待的这一段。两者相减后，剩下的除了飞行时间，还有作答时间的一半乘以两个晶振的速率之差——关键只在于两端速率不同，两端同时偏快多少则没有影响。因此，不作修正的单边双向测距（single-sided two-way ranging, SS-TWR）测得的实际上是锚点的等待时长：两个晶振反向各偏十个 ppm 时，等待一个时隙，距离就偏长将近六米；等待两个、三个、四个时隙，偏差成倍增加。四次读数全都偏长，而不是随机散布。修正依靠接收端测得的时钟偏差（clock offset），即 Coffs——标准把这项测量列为可选能力（§10.29.1.6），没有规定测量方法，典型实现是在锁定接收脉冲时一并得出：用它缩放作答时间，误差就从几米降到几厘米。但 Coffs 本身也带有一定的估计误差，剩余误差项仍是作答时间的一半乘以这一误差，所以仍随等待时长增大。',
  outcomes: [
    '说明为什么“用对方的时钟测得的应答时间”会使测得的距离偏长',
    '根据锚点在第几个时隙作答，预测距离会偏长多少',
    '在测距行上区分修正值与 raw 值',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'crystal', plain: '无线设备用于计时的石英晶体；任何两片的频率都不完全相同' },
    { term: 'ppm', plain: '百万分之几：时钟速率误差的单位' },
    { term: 'clock offset', plain: '一台设备的时钟相对于另一台的快慢，以比值表示' },
    { term: 'SS-TWR', plain: '单边双向测距：一次请求、一次应答' },
    { term: 'Coffs', plain: '接收端测得的、相对于发送端的时钟偏差' },
  ],
  picture: [
    { heading: '四个锚点，一个距离', text: '四个锚点布置在手机周围的圆周上，与手机的距离相同、高度也相同。手机只发起一次请求，四个锚点都收到了，随后依次作答，各占一个时隙：一次请求，得到对同一距离的四次测量。' },
    { kind: 'watch', jump: 2, heading: '它报出的距离是多少', text: '载入仿真，跳到第一条测距行。手机与那个锚点相距三米半，它测得的是多少？再读接下来的三行。' },
    { heading: '一个从未校准的晶振', text: '每台设备都用自己的晶振计时，没有哪个晶振恰好工作在标称频率上——这一误差用百万分之几（ppm）表示。这里手机的时钟偏快，各锚点的时钟都偏慢，而双方都不知道这一点。两端相减的仍是自己计数器上的两次读数：未知的起点被消去了，速率误差却没有。' },
    {
      kind: 'diagram', heading: '两端的时钟，四段等待', spec: uwbSstwrTiming(),
      caption: '按比例绘制的一整轮。灰条是锚点从收到 Poll 到发出应答之间的等待时间，由锚点自己的时钟测量，写入应答帧供手机减去（本课的场景采用这种嵌入方式）。手机测量的是同一段时间再加两次单程飞行，用的是手机自己的时钟；真正来自另一端时钟的，是它要减去的那个数。两个数几乎能够抵消，未能抵消的差值就是灰条上标注的数，即它在 raw 距离上造成的偏差——下面逐步说明它的来源。',
    },
    { heading: '不属于手机的那个时钟是锚点的时钟', text: '先说明「另一端」指什么。灰条那一段——锚点从收到 Poll 到发出应答之间的等待时间——起点和终点的时间戳都取自锚点自己的计数器，两个计数值相减后写入应答帧发给手机——标准的一对多单边测距正是让每个响应方在应答帧里携带这个值（§10.32.4）。手机无法自己测量这一段：它无从得知锚点何时收到 Poll。所以手机要减去的那个数，是用一个不属于它的时钟测得的；而手机自己的那个数，即从 Poll 发出到应答到达的整段时间，完全由手机自己的时钟测量。' },
    { heading: '由谁测量，就按谁的时钟缩放', text: '「按各自的时钟缩放」指的是：一段时间的测量值取决于测量它的晶振的频率。手机快 10 ppm，在同一段真实时间里，它的计数器会多计百万分之十，于是它测得的往返时间是真值的 1.00001 倍，偏长。每个锚点慢 10 ppm，它测得的灰条时长是真值的 0.99999 倍，偏短。关键在于这两个倍数不同：一个乘 1.00001，一个乘 0.99999，而这两个值接下来要相减。' },
    { heading: '相减的目的本来是消去这段等待', text: '手机计算距离只用一个公式：飞行时间 =（往返 − 应答时长）÷ 2。它成立是因为灰条本来就包含在往返时间之内——手机测得的整段时间，就是锚点的等待时间再加两次单程飞行，没有其他成分。所以减去应答时长，要消去的正是锚点的等待时间：这个场景中它是 2 ms，而单程飞行只有 11.675 ns，不把这 2 ms 从往返时间中去掉，就根本无法得到距离。被抵消的是这段等待本身，它不是误差。它无法完全消去，只是因为相减的两个值是由两个速率不同的时钟测得的。' },
    {
      kind: 'formula', heading: '相减之后剩下的那一项',
      text: 'Tround  = Treply + 2·Tprop\nT̂round = (1 + eA)·Tround\nT̂reply = (1 + eB)·Treply\n(T̂round − T̂reply) / 2\n   = (1 + eA)·Tprop + ½·Treply·(eA − eB)',
      note: '第一行就是上面那张图：手机测得的时间等于锚点的等待时间加两次单程飞行。eA 是手机的 +10 ppm，eB 是锚点的 −10 ppm；带记号的两个值才是两端各自实际读出的数，也就是手机实际相减的两个数。最后一行分为两项：前一项是经过缩放的飞行时间，即距离；后一项不含任何距离信息，只有锚点等待时间的一半乘以 eA − eB。四条灰条长短不同，这一差别通过这一项完整地传递到 raw 距离上。',
    },
    { heading: 'eA − eB 来自晶振容差', text: 'eA − eB 不是人为设定的参数，而是两个晶振各自偏差之差。标准规定的晶振容差是 ±20 ppm（§16.4.9；严格说这一条管的是发射中心频率，§16.4.6 对码片（chip）速率给出同样的容差），本场景在这个范围内选取了反向偏离的一对：手机 +10 ppm，锚点 −10 ppm，相差 20 ppm。只有这个差值进入上面那一项：如果两端同时快 10 ppm，差值为零，后一项完全消失。绝对频率偏差没有影响，两端速率不同才有影响——这也是后面的修正只需要测出一个差值、而不必知道哪个时钟准确的原因。' },
    { heading: '把一个时隙换算成米', text: '这几步可以自己计算一遍。第一个锚点等待 1 个时隙，灰条是 2 ms：取一半得 1 ms，乘以 20 ppm 得 20 ns。20 ns 是光传播 5.996 m 所需的时间，于是 raw 距离偏长将近六米。等待 2、3、4 个时隙的锚点，灰条成倍增长，这一项也随之成倍增长——图上四条灰条标注的 +6.01、+11.97、+17.99、+23.92 m，就是这一步分别乘以 1、2、3、4 的结果。' },
    { text: '所以不作修正时，单边双向测距（SS-TWR）的结果反映的不是距离，而是应答方的等待时长：每个时隙对应六米。' },
    { heading: '由接收端测量对端时钟的速率', text: '接收端必须先锁定接收到的脉冲，才能找到 RMARKER（ranging marker）；在典型实现里，完成这次锁定的环路同时也得知了这些脉冲相对于本地晶振的速率。这个比值就是时钟偏差（clock offset），它是测得的，而不是假定的；本课把接收端报告的这个比值记作 Coffs。标准把这项测量称为晶振特性测量（crystal characterization），列为可选能力，结果以测距跟踪偏差与测距跟踪区间两个值上报（§10.29.1.6），并不规定怎样测量；标准还给出另一条途径：由上层用加扰时间戳序列（scrambled timestamp sequence, STS）各段起止处的接收时间戳估计（§10.29.1.1）。用它缩放应答时长，原来的“几乎抵消”就成为真正的抵消。' },
    { heading: '修正之后还剩下什么', text: 'Coffs 本身也是测量值，带有一定误差。修正把一个大的速率误差换成了一个很小的误差，但剩余的那一项仍是应答时长的一半乘以这个小误差，所以它仍随等待时长增大。下一课通过改变计算方式直接消去这段等待。' },
  ],
  numbers: [
    { kind: 'formula', heading: 'raw 估计实际包含哪些成分', text: 'T̂prop = (Tround·(1 + eA) − Treply·(1 + eB)) / 2\n       = Tprop + Tprop·eA + ½·Treply·(eA − eB)', note: 'eA 是发起方的速率误差，eB 是应答方的。剩余两项：第一项是飞行时间的缩放误差，只有几十微米；第二项是等待时间的缩放误差，2 ms 的应答取一半再乘以 20 ppm，即 20 ns，合 6.0 m。' },
    { kind: 'table', heading: '四个锚点，四个误差', head: [
      '锚点', 'Treply', '预测误差',
      'raw 距离', 'raw 误差',
    ], rows: [
      ['anchor-1', '2 ms − Tprop', '6.0 m', '9.51 m', '6.01 m'],
      ['anchor-2', '4 ms − Tprop', '12.0 m', '15.47 m', '11.97 m'],
      ['anchor-3', '6 ms − Tprop', '18.0 m', '21.49 m', '17.99 m'],
      ['anchor-4', '8 ms − Tprop', '24.0 m', '27.42 m', '23.92 m'],
    ] },
    { text: '这不是随机散布：四次读数全都偏长，每一个的误差都是第一个的整数倍。手机距每个锚点都是 3.50 m。' },
    { kind: 'table', heading: '同样的线性增长，三种晶振', head: [
      '晶振', 'eA − eB',
      '时隙 1 的 raw 误差', '时隙 4 的 raw 误差',
    ], rows: [
      ['理想晶振', '0 ppm', '+1.9 cm', '−6.1 cm'],
      ['温补晶振，±1 ppm', '2 ppm', '0.62 m', '2.34 m'],
      ['本场景，±10 ppm', '20 ppm', '6.01 m', '23.92 m'],
    ] },
    { kind: 'formula', heading: '经过修正的单边双向测距', text: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2', note: '只多了一次乘法：Treply 是按锚点的计数单位测得的，经过缩放即换算为 Tround 所用的单位。圆周上四个距离本来相同，四条测距行现在分别为 3.45、3.42、3.41 与 3.51 m。设备本身没有任何改变。' },
    { kind: 'table', heading: '修正之后留下的', head: [
      '锚点', '应答时长',
      '剩余误差 1σ', '本次运行的误差',
    ], rows: [
      ['anchor-1', '2 ms', '6.0 cm', '−5.3 cm'],
      ['anchor-2', '4 ms', '12.0 cm', '−7.8 cm'],
      ['anchor-3', '6 ms', '18.0 cm', '−9.5 cm'],
      ['anchor-4', '8 ms', '24.0 cm', '+0.5 cm'],
    ] },
    { text: '最后一列是从这些分布中各取一个样本，所以并不逐行增大：分布最宽的那个这次恰好最接近真值。' },
    { kind: 'steps', heading: '一次测距的步骤', items: [
      '时隙 0。手机用自己的计数器为 Poll 发出时的 RMARKER 打时间戳；四个锚点也各自用自己的计数器为同一个 RMARKER 的到达打时间戳。',
      '锚点在自己的时隙里为 Response 的发出打时间戳，将自己的两个计数值相减后写入这一帧（嵌入方式，§10.32.4）：应答时长 Treply，完全由锚点自己的晶振测量。',
      '手机为 Response 的到达打时间戳，再将自己的两个计数值相减：往返时长 Tround。四个时间戳，两端各两个，任何一端都没有拿对方的时间戳做减法。',
      '同一次接收同时给出锚点晶振相对于手机的快慢：这就是 Coffs，这里是 −20.24 ppm——按本课的模型，它等于两个晶振相差的 20 ppm，加上估计器 0.2 ppm 的误差（真实设备通常由载波锁定得出）。',
      '将两段时间之差除以二。不计 Coffs 得到 2028 格，即测距行上给出的 raw 值；先用 Coffs 缩放应答时长再除以二，得到 734.6 格。',
      '乘以一格的 15.65 ps，再乘以光速：3.45 m，真值是 3.50 m。',
      '测距行给出的就是这个数，旁边是 raw 值，后面是一个品质因数（figure of merit, FoM）字节——不带误差棒。用于绘制误差椭圆的 1σ 另行计算，只由时间戳噪声决定：100 ps ÷ √2 × 光速，合 2.1 cm。',
    ] },
    { kind: 'table', heading: '锚点 1 的逐步计算', head: [
      '步骤', '数值',
    ], rows: [
      ['手机发出 Poll', '336 207 494 703'],
      ['它到达锚点 1', '26 381 597 885'],
      ['锚点 1 发出 Response', '26 509 391 059'],
      ['= Treply，锚点的晶振', '127 793 174'],
      ['它到达手机', '336 335 291 933'],
      ['= Tround，手机的晶振', '127 797 230'],
      ['Coffs，由本课的模型给出', '−20.24 ppm'],
      ['差值除以二，不计 Coffs', '2028 · 9.51 m'],
      ['差值除以二，计入 Coffs', '734.6 · 3.45 m'],
    ] },
  ],
  deeper: [
    { heading: '剩下的那两项', text: '把 Tround = Treply + 2·Tprop 代进 raw 公式，应答时长抵消后只剩上面那两项。Tprop·eA 是用 10 ppm 缩放 11.675 ns 的飞行时间：0.12 皮秒，合 35 微米，可以忽略。另一项缩放的是应答时长，而 2 ms 的应答时长约为飞行时间的十七万倍。两端各自测得的时长相差 4056 格，这本应只是两次单程飞行的时间。' },
    { heading: '剩余误差有多大', text: '修正把 20 ppm 的原始偏差换成了估计器上 0.2 ppm 的噪声。1 ms 的 0.2 ppm 取一半是 0.1 ns，于是锚点每多等待 1 ms，剩余误差就增加 3.0 cm。锚点 3 的 −9.5 cm 完全落在它自己 18.0 cm 的 σ 之内。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '本课的 Coffs 不是从载波锁定里测出来的：它直接取两台设备真实 ppm 之差，再加上少量高斯噪声。所以正文中「接收端锁定接收到的脉冲，同时得知它们相对于本地晶振的速率」是真实硬件的做法；本课中并没有锁相环，因此不存在失锁、错锁或在弱链路上估计变差的情形。' },
    { kind: 'model-value', text: '那 0.2 ppm 的残余误差是模型取值，而且它不随链路好坏变化：时间戳噪声会随信干噪比放大到十倍，Coffs 的误差却始终是 0.2 ppm。真实的载波频偏估计和时间戳一样受信噪比影响，一条微弱的链路上两项会一起变差——所以本课那张「修正之后留下的」表在远距离上偏乐观。' },
    { kind: 'unmodelled', text: '每台设备的晶振是一个常数：本课用一个固定 ppm 线性缩放时间，整场都不变。真实晶振会随温度漂移、会老化、还带相位噪声，所谓「两块晶振相差 20 ppm」在一小时之内并不是同一个 20 ppm。本课中那条规整到可以按时隙数预测的线性增长，因此比真实设备上测得的稳定得多。' },
    { kind: 'unmodelled', text: '锚点的作答时刻精确到纳秒：设备恰好在时隙边界那一刻发射，所以 Treply 恰好是整数个 2 ms 减去一趟飞行，只带接收戳那一点噪声。真实设备的收发转换时间、中断延迟与调度抖动会让这段等待每一轮都不同，而它正是本课误差的乘数——等待时长抖动多少，误差就随之抖动多少。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.1.2.2 给出单边双向测距的计算式；§10.29.1.6 定义了测距跟踪偏差与测距跟踪区间——支持这项可选能力的接收端，就是用这两个字段上报自己测到的发送端时钟速率。±20 ppm 的晶振容差来自 §16.4.9。',
    '测距行末尾那个品质因数字节及其三张查找表出自 §10.29.1.7。本课只指出它的存在；如何解读它，留到后面讲非视距的那一课。',
    '有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及 2 ms 的测距时隙（ranging slot）——最后这个来自 FiRa，不是标准正文。',
  ],
  scenario: () => uwbSstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: '理想晶振', scenario: () => uwbSstwrScenario({ tag: 0, anchors: 0 }) },
    { label: '±1 ppm 的温补晶振', scenario: () => uwbSstwrScenario({ tag: 1, anchors: -1 }) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('第一个锚点作答', firstUwbResp),
    J('第一次测距：raw 偏长 6 m', firstUwbRange),
    J('第四次测距：raw 偏长 24 m', fourthUwbRange),
  ],
  observe: [
    '0 ns 处的一帧 Poll 产生四条 RX_START，全都在 12 ns：四个锚点一样远。整轮占用五个 2 ms 的时隙。',
    '按顺序读四条 UWB_RANGE。修正后的读数落在 3.41 与 3.51 m 之间，括号里的 raw 值却逐次增大：9.51 → 15.47 → 21.49 → 27.42 m。',
    '把相邻的 raw 值相减：5.96、6.02、5.93 m。每多等待一个时隙，raw 距离就增加六米——这是系统偏差，不是随机散布。',
  ],
  tryThis: [
    '载入“理想晶振”：它把两端的偏差都设为零，其他设置不变。线性增长随即消失——raw 误差只剩正负几厘米，作答的时隙也不再有影响。剩下的只有时间戳噪声，它的 1σ 是 2.1 cm。',
    '再载入“±1 ppm 的温补晶振”：偏差只有基准场景的十分之一，是实际产品中会选用的器件。线性增长依然存在，每个时隙约 0.60 m：更好的晶振只把误差降低一个数量级，并不能消除这项误差。',
  ],
  quiz: [
    {
      q: '锚点 1 与锚点 4 一样远，为什么后者的 raw 误差是前者的四倍？',
      options: [
        '又过了三个时隙，衰落让它的应答更弱',
        '剩下的误差是应答时长的一半乘以速率之差，而它的应答时长是前者的四倍',
        '它的计数器有四倍的时间可以漂移',
      ],
      answer: 1,
      explain: '不是计数器在漂移，而是一段被测时间上的比例误差：同样的速率之差，乘以更长的时间。',
    },
    {
      q: 'Coffs 这个值是从哪里来的？',
      options: [
        '来自锚点的数据手册，在会话建立时交换',
        '来自接收端对接收脉冲的锁定，以本地晶振为基准比较得出',
        '由往返时间与应答时间之差得到',
      ],
      answer: 1,
      explain: '在典型实现中，它是接收端必须完成的那次锁定的副产品；标准把这项测量列为可选（§10.29.1.6），也允许上层用 STS 段的接收时间戳估计它（§10.29.1.1）。若试图从那个差值推出它，就会陷入循环。',
    },
    {
      q: '修正之后锚点 4 的距离反而最准。在时隙 4 作答是不是最好？',
      options: [
        '是——更长的应答时延让接收端有更多时间去平均',
        '否——时隙 4 的剩余误差最宽，1σ 为 24.0 cm，而锚点 1 只有 6.0 cm',
        '否——精度是真实的，但它来自锚点 4 所在的位置',
      ],
      answer: 1,
      explain: '剩余误差像 raw 误差一样随应答时长增长；从宽分布中抽取一个样本，结果可能落在任何位置。',
    },
  ],
}
