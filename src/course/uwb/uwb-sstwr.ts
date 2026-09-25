/**
 * UWB Tier 1 · M14 两只钟 · The clock inside the reply time.
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
 *  - §4 gives it a `timing` figure, Tround 与 Treply 画在两只钟上，四个时隙上的
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
  module: 13,
  title: '应答时间里藏着的那只时钟',
  why: '前面几课让两台射频都守着完美的时间，现实里没有哪一对是这样：石英晶振（crystal）总会走得偏快或偏慢，用走得慢的钟量出来的一段时间就偏短。偏偏交互里最长的那一段是锚点（anchor）量的，手机却把它当成自己量的直接减掉。这一课里，这件事会错出好几米。',
  outcomes: [
    '说清为什么“用对方的钟量出来的应答时间”会把距离测长',
    '根据锚点在第几个时隙作答，预测它会测长多少',
    '在测距行上分清修正值与 raw 值',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'crystal', plain: '射频用来数时间的那片石英；没有两片走得一样快' },
    { term: 'ppm', plain: '百万分之几：时钟速率误差的单位' },
    { term: 'clock offset', plain: '一台射频的钟比另一台快多少，写成一个比值' },
    { term: 'SS-TWR', plain: '单边双向测距：一问一答' },
    { term: 'Coffs', plain: '接收端对正在听的那台射频测出的时钟偏差' },
  ],
  picture: [
    { heading: '四个锚点，一个距离', text: '四个锚点摆在手机周围的圆环上，离它一样远、也一样高。手机只问一次，四个锚点都听见了，随后逐一作答，各占一个时隙：一次提问，换来对同一个距离的四次测量。' },
    { kind: 'watch', jump: 2, heading: '它以为这段距离是多少？', text: '载入仿真，跳到第一条测距行。手机离那个锚点三米半，它自己以为是多少？再往下读接着的三行。' },
    { heading: '一块从没被校准过的晶振', text: '每台射频都用自己那块晶振数时间，没有哪块真的走在标称速率上——这点误差用百万分之几（ppm）说。这里手机走得偏快，锚点都走得偏慢，谁也不知道。两端减的仍是自己计数器上的两次读数：未知的起点被约掉了，速率却没有。' },
    {
      kind: 'diagram', heading: '两只钟，四段等待', spec: uwbSstwrTiming(),
      caption: '按比例画的一整轮。灰条是锚点从收下 Poll 到发出应答等的那段，由它自己的钟量出，写进应答帧让手机减掉；手机量的是同一段再加两趟飞行，用的是另一只钟。两个数各被自己的速率拉长，一减之下大部分抵消，剩下的是这段等待的一半乘以两端速率之差——条上那个数，就是它在 raw 距离上的样子。',
    },
    { text: '所以不作修正的话，单边双向测距（SS-TWR）量出来的不是距离有多远，而是应答方等了多久：一个时隙六米。' },
    { heading: '问接收端：对面那只钟走得多快', text: '接收端必须先锁住进来的脉冲，才谈得上找到 RMARKER（ranging marker）；而完成这次锁定的环路顺带就知道：这些脉冲相对自己那块晶振跑得有多快。这个比值就是时钟偏差（clock offset），是测出来的，不是假定的；仿真器把它挂在每个收到的帧上，叫作 Coffs。拿它缩放应答时长，那次“几乎抵消”就成了真的抵消。' },
    { heading: '修正之后还剩下什么', text: 'Coffs 自己也是测出来的，本身就带着一点误差。修正把一个大的速率误差换成一个很小的，但残下的那一项依旧是应答时长的一半乘以这个小误差，所以它还是随等待变大。下一课改用算术把这段等待直接消掉。' },
  ],
  numbers: [
    { kind: 'formula', heading: 'raw 估计里真正装着什么', text: 'T̂prop = (Tround·(1 + eA) − Treply·(1 + eB)) / 2\n       = Tprop + Tprop·eA + ½·Treply·(eA − eB)', note: 'eA 是发起方的速率误差，eB 是应答方的。活下来的是两项：第一项缩放飞行时间，只有几十微米；第二项缩放等待，2 ms 的应答取一半再乘 20 ppm，就是 20 ns，合 6.0 m。' },
    { kind: 'table', heading: '四个锚点，四个误差', head: [
      '锚点', 'Treply', '预测误差',
      'raw 距离', 'raw 误差',
    ], rows: [
      ['anchor-1', '2 ms − Tprop', '6.0 m', '9.51 m', '6.01 m'],
      ['anchor-2', '4 ms − Tprop', '12.0 m', '15.47 m', '11.97 m'],
      ['anchor-3', '6 ms − Tprop', '18.0 m', '21.49 m', '17.99 m'],
      ['anchor-4', '8 ms − Tprop', '24.0 m', '27.42 m', '23.92 m'],
    ] },
    { text: '这不是散布：四次读数全都偏长，每一个都是第一个的整数倍。手机距每个锚点都是 3.50 m。' },
    { kind: 'table', heading: '同一道斜坡，三种晶振', head: [
      '晶振', 'eA − eB',
      '时隙 1 的 raw 误差', '时隙 4 的 raw 误差',
    ], rows: [
      ['理想晶振', '0 ppm', '+1.9 cm', '−6.1 cm'],
      ['温补晶振，±1 ppm', '2 ppm', '0.62 m', '2.34 m'],
      ['本场景，±10 ppm', '20 ppm', '6.01 m', '23.92 m'],
    ] },
    { kind: 'formula', heading: '经过修正的单边双向测距', text: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2', note: '只多了一次乘法：Treply 送来时按锚点的计数单位量，缩放一下就换成了 Tround 所用的单位。圆环上四个距离本是一样的，四条测距行现在读作 3.45、3.42、3.41 与 3.51 m。射频本身什么都没有变。' },
    { kind: 'table', heading: '修正之后留下的', head: [
      '锚点', '应答时长',
      '剩余误差 1σ', '本次运行的误差',
    ], rows: [
      ['anchor-1', '2 ms', '6.0 cm', '−5.3 cm'],
      ['anchor-2', '4 ms', '12.0 cm', '−7.8 cm'],
      ['anchor-3', '6 ms', '18.0 cm', '−9.5 cm'],
      ['anchor-4', '8 ms', '24.0 cm', '+0.5 cm'],
    ] },
    { text: '最后一列是从这些分布里各抽一次，所以并不一路变大：最宽的那个这次恰好落得最近。' },
    { kind: 'steps', heading: '一次测距，一步一步', items: [
      '时隙 0。手机给 Poll 离开时的 RMARKER 打一个戳，用自己的计数器；四个锚点也给同一个 RMARKER 的到达打戳，各用各的。',
      '锚点在自己的时隙里给 Response 的离开打戳，把自己那两个计数值一减，写进这一帧：应答时长 Treply，完全在锚点自己的晶振上量出。',
      '手机给 Response 的到达打戳，再减去自己那两个计数值：往返时长 Tround。四个戳，两端各两个，谁也没去减对方的那一个。',
      '同一次接收的载波锁定顺带报出锚点的晶振比手机快多少：这就是 Coffs，这里是 −20.24 ppm——两块晶振相差的 20 ppm，加上估计器弄错的 0.2 ppm。',
      '把两段时间的差折半。不算 Coffs 得到 2028 格，就是测距行上打印的 raw 值；先用 Coffs 缩放应答时长再折半，得到 734.6 格。',
      '乘以一格的 15.65 ps，再乘以光速：3.45 m，真值是 3.50 m。',
      '测距行带的就是这个数，旁边是 raw 值，后面跟一个品质因数（figure of merit, FoM）字节——从来没有误差棒。画误差椭圆的那个 1σ 另算，只由时间戳噪声决定：100 ps ÷ √2 × 光速，合 2.1 cm。',
    ] },
    { kind: 'table', heading: '锚点 1，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['Poll 离开手机', '336 207 494 703'],
      ['它到达锚点 1', '26 381 597 885'],
      ['锚点 1 的 Response 离开', '26 509 391 059'],
      ['= Treply，锚点的晶振', '127 793 174'],
      ['它到达手机', '336 335 291 933'],
      ['= Tround，手机的晶振', '127 797 230'],
      ['Coffs，由载波锁定得出', '−20.24 ppm'],
      ['折半的差，不算 Coffs', '2028 · 9.51 m'],
      ['折半的差，算上 Coffs', '734.6 · 3.45 m'],
    ] },
  ],
  deeper: [
    { heading: '活下来的那两项', text: '把 Tround = Treply + 2·Tprop 代进 raw 公式，应答时长就抵消到只剩上面那两项。Tprop·eA 是拿 10 ppm 去缩放 11.675 ns 的飞行时间：0.12 皮秒，合 35 微米，可以直接忘掉。另一项缩放的是应答时长，而 2 ms 的应答时长大约是飞行时间的十七万倍。两端各自那一对读数相差 4056 格，本该只是两趟飞行。' },
    { heading: '剩余误差有多大', text: '修正把 20 ppm 的原始偏差换成了估计器上 0.2 ppm 的噪声。1 ms 的 0.2 ppm 取一半是 0.1 ns，于是锚点每多等 1 ms，剩余误差就多 3.0 cm。锚点 3 的 −9.5 cm 稳稳落在它自己 18.0 cm 的 σ 之内。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.1.2.2 给出单边双向测距的计算式；§10.29.1.6 定义了测距跟踪偏差与测距跟踪区间——接收端就是用这两个字段上报自己测到的发送端时钟速率。±20 ppm 的晶振容差来自 §16.4.9。',
    '测距行末尾那个品质因数字节及其三张查找表出自 §10.29.1.7。这一课只说它在那里；它怎么读，留给后面讲非视距的那一课。',
    '有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及 2 ms 的测距时隙（ranging slot）——最后这个来自 FiRa，不是标准正文。',
  ],
  scenario: () => uwbSstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: '理想晶振', scenario: () => uwbSstwrScenario({ tag: 0, anchors: 0 }) },
    { label: '±1 ppm 的温补晶振', scenario: () => uwbSstwrScenario({ tag: 1, anchors: -1 }) },
  ],
  jumps: [
    J('Poll 帧离开手机', firstUwbPoll),
    J('第一个锚点作答', firstUwbResp),
    J('第一次测距：raw 长了 6 m', firstUwbRange),
    J('第四次测距：raw 长了 24 m', fourthUwbRange),
  ],
  observe: [
    '0 ns 处的一帧 Poll 产生四条 RX_START，全都在 12 ns：四个锚点一样远。整轮花掉五个 2 ms 的时隙。',
    '按顺序读四条 UWB_RANGE。修正后的读数落在 3.41 与 3.51 m 之间，括号里的 raw 值却一路爬升：9.51 → 15.47 → 21.49 → 27.42 m。',
    '把相邻的 raw 值相减：5.96、6.02、5.93 m。每多等一个时隙就多付六米——这是偏差，不是散布。',
  ],
  tryThis: [
    '载入“理想晶振”：它把两端都钉在零，别的什么都不改。斜坡随即消失——raw 误差只剩正负几厘米，作答的时隙也不再要紧。剩下的只有时间戳噪声，它的 1σ 是 2.1 cm。',
    '再载入“±1 ppm 的温补晶振”：偏差只有基准的十分之一，也是认真的产品真会选用的器件。斜坡依然在，每个时隙约 0.60 m：更好的晶振买来的是一个数量级，不是正确性。',
  ],
  quiz: [
    {
      q: '锚点 1 与锚点 4 一样远，为什么后者的 raw 误差是前者的四倍？',
      options: [
        '又过了三个时隙，衰落让它的应答更弱',
        '活下来的误差是应答时长的一半乘以速率之差，而它的应答时长长了四倍',
        '它的计数器有四倍的时间可以漂移',
      ],
      answer: 1,
      explain: '不是计数器在漂移，而是一段被测时间上的比例误差：同样的速率之差，乘更长的时间。',
    },
    {
      q: 'Coffs 这个值是从哪里来的？',
      options: [
        '来自锚点的数据手册，在会话建立时交换',
        '来自接收端对进来的脉冲的锁定，拿自己的晶振比出来',
        '由往返时间与应答时间之差得到',
      ],
      answer: 1,
      explain: '它是接收端无论如何都要完成的那次锁定的副产品。想从那个差值推出它就成了循环。',
    },
    {
      q: '修正之后锚点 4 的距离反而最准。在时隙 4 作答是不是最好？',
      options: [
        '是——更长的应答时延让接收端有更多时间去平均',
        '否——时隙 4 的剩余误差最宽，1σ 为 24.0 cm，而锚点 1 只有 6.0 cm',
        '否——精度是真实的，但它来自锚点 4 所在的位置',
      ],
      answer: 1,
      explain: '剩余误差像 raw 误差一样随应答时长增长；从宽分布里抽一次，落在哪儿都有可能。',
    },
  ],
}
