/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · EDCA: four queues, and the two numbers that
 * decide between them.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8): the
 * first half of the old lesson. What this half owns is how a win is decided —
 * the four access categories, the AIFS each one must hear and the width of its
 * first draw, with the procedure the MAC actually runs. What the head start
 * COSTS, who pays it, and the one station in this room that ever owes an EIFS
 * are `edca-cost`, which loads this same scene (`sameSceneAs: 'edca'`).
 *
 * Cut here, as §5 names them:
 *  - 「窗口为什么是翻倍而不是加一」and 「等待的整把梯子」(§5.1.5): `collisions-cw`
 *    owns the doubling and `ifs` owns the ladder, and this lesson points at them
 *    rather than teaching them again.
 *  - 「把抢跑量出来」(§5.3): it re-derived the 45 µs the table above it prints;
 *    the figure now shows it and the caption states it once.
 *  - the waiting-room metaphor 「一台电台，四间候车室」and 「两个旋钮，没有裁判」
 *    (§5.2), and 抢跑 is down from eight uses to one.
 *  - the `deeper` note 「当自己的两条队列打平」, which restated step 6 of the
 *    procedure in the same words.
 *
 * The scenario builder and the jump-zero predicate are unchanged, so the
 * recorded timeline hash stays identical. Every number quoted below is pinned
 * in tests/course/edca.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstVo, J } from '../lessonKit'

/**
 * The four categories' AIFS, drawn from one frame end to scale.
 *
 * The zero point is a real instant of this run — 23.0816 ms, the moment the air
 * goes idle before the caller's first voice frame, which is the first row of the
 * worked table below the figure — and the first lane is the frame that ended
 * there: the access point's 32 µs answer, from 23.0496.
 *
 * Two of the four AIFS lanes are records at that instant, 34 µs on the caller
 * and 43 µs on the uploader; 79 µs is the same sum, `aifsNs(AIFSN)`, for the
 * category that had nothing to send just then, and the caption says which is
 * which. The five slots between the top lane and the bottom one are the whole
 * mechanism of this lesson: 79 − 34 = 45 µs in which voice counts and background
 * may not.
 */
export function edcaAifsTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [{ fromUs: -32, toUs: 0, label: '回答' }] },
      { label: 'VO 语音', spans: [{ fromUs: 0, toUs: 34, label: '34 µs', tone: 'accent' }] },
      { label: 'VI 视频', spans: [{ fromUs: 0, toUs: 34, label: '34 µs' }] },
      { label: 'BE 尽力', spans: [{ fromUs: 0, toUs: 43, label: '43 µs' }] },
      { label: 'BK 后台', spans: [{ fromUs: 0, toUs: 79, label: '79 µs' }] },
    ],
    axis: { fromUs: -40, toUs: 110, ticks: [0, 50, 100], unit: 'µs（0 是帧尾）' },
  }
}

export const edca: Lesson = {
  id: 'edca',
  module: 7,
  title: 'EDCA——四条队列，两个数',
  why: '一通电话和一个文件上传抢的是同一片空口，但它们要的东西不一样。几毫秒的等待就能毁掉通话；同样的等待落在上传上，谁也察觉不到。可到目前为止的规则对每一帧都一视同仁，于是通话只能和上传一起碰运气，而且通常运气更差。这一课我们看一台电台如何不再以“一个竞争者”的身份参赛，而是变成四个——以及分出胜负的，是哪两个数。',
  outcomes: [
    '说清一台站点（STA）把自己的流量分成四类之后，内部到底变了什么',
    '从仿真里读出某一类必等的静默和抽取宽度，并说出优势主要是哪一个带来的',
  ],
  needs: ['ifs', 'backoff', 'collisions-cw'],
  terms: [
    { term: 'EDCA', plain: '增强型分布式信道接入：这条规则让一台站点拥有四条等待队列，而不是一条，每一条各自去竞争' },
    { term: 'access category', plain: '一帧进入电台时被归入的那一类：语音、视频、尽力而为、后台' },
    { term: 'AIFS', plain: '仲裁帧间间隔：一条队列的倒数开始走动之前必须听到的那段安静——就是那段固定的长等待，只是按类别做成了可调的' },
  ],
  picture: [
    { heading: '一台电台，四个竞争者', text: '每一帧进入电台的时候，都会按它装的东西被归入四类之一：一通电话、一部影片、普通流量，或者压根没人在等的东西。每一类有自己的队列（queue），每条队列各跑各的倒数，就像房间里另一台独立的站点一样。哪条先数到零，电台就发哪条的帧。这就是增强型分布式信道接入（enhanced distributed channel access, EDCA）；而这四条队列里的每一条，标准里称为一个接入类别（access category, AC）。' },
    { heading: '分出胜负的两个数', text: '为了在它们之间分出胜负，并没有新增任何东西：没有调度器，也不用向谁请示。四条队列玩的还是退避（backoff）那一课里的同一套等待游戏，只有两个数按类别分别设定。第一个是：这条队列必须先听到多久的“什么都没有”，它的倒数才被允许走动，这就是它的仲裁帧间间隔（arbitration interframe space, AIFS）。第二个是：它抽倒数值时的取值范围有多宽，也就是它那两个竞争窗口（contention window, CW）。语音等得更短，抽得更小。' },
    { kind: 'watch', jump: 0, heading: '看通话是怎么挤进去的', text: '载入仿真，跳到通话站点的第一帧。旁边的上传站点从来没停过，可通话依然上了空口。把鼠标悬在通话站点的倒数色块上，再悬在备份站点的色块上，比一比这两个块上的数。' },
    { heading: '更短的静默，每一轮都要兑现一次', text: '这两个数给的优势并不是同一种。抽取范围更窄，只是把概率往一边拨了拨——后台队列照样可能抽到很小的数然后赢。更短的静默要硬得多：当后台队列还在熬它那段必等的安静时，语音队列已经在倒数了，而在这些时隙（slot time）里，后台队列连开始的资格都没有。这是抢跑，而且每一轮都要兑现一次。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '同一个帧尾出发，四类各等多久',
      spec: edcaAifsTiming(),
      caption: '零点取本轮的 23.0816 ms：接入点（access point, AP）那个 32 µs 的回答刚刚结束，空口重新安静下来。这一刻真的在跑的是 34 µs 和 43 µs 两条（通话站点一条，上传站点一条）；79 µs 那条是同一个和式按后台的时隙数算出来的。最上和最下相差 45 µs，正好五个时隙——这五个时隙里语音在数，后台不许数。',
    },
    { kind: 'table', heading: '每一类拿到的三个常数', head: [
      '类别', 'AIFSN（静默的时隙数）',
      '先等的静默，即它的 AIFS',
      '第一次抽取：0 到最小竞争窗口 CWmin',
      '翻倍可到最大竞争窗口 CWmax', '出处',
    ], rows: [
      ['VO（语音）', '2', '34 µs', '3', '7', 'Table 9-194'],
      ['VI（视频）', '2', '34 µs', '7', '15', 'Table 9-194'],
      ['BE（尽力而为）', '3', '43 µs', '15', '1023', 'Table 9-194'],
      ['BK（后台）', '7', '79 µs', '15', '1023', 'Table 9-194'],
    ] },
    { kind: 'formula', heading: '这些等待是怎么来的', text: 'AIFS = SIFS + AIFSN × 时隙 = 16 + AIFSN × 9 µs，AIFSN 取 2、3 或 7', note: '过去那段“一刀切”的等待，就是这同一个式子把仲裁帧间间隔数（arbitration interframe space number, AIFSN）钉死在 2：一个常数被改成了参数。至于窗口失败一次为什么翻倍、整个帧间间隔家族还有哪几级，分别是“沉默、期限，和被拉宽的窗口”与“两种等待”那两课的事。' },
    { kind: 'steps', heading: '一帧的等待是怎么定下来的，一步一步', items: [
      '这一帧进来时被归入某一个接入类别，排进那一类自己的队列。每条队列都有自己的计数器和自己的窗口；上面那张表里的三个常数，就是这四条队列全部的区别所在。',
      '这条队列必等的静默，由它的 AIFSN 按上面那个和式算出：两个时隙是 34 µs，七个时隙是 79 µs。',
      '手里有帧、空中又安静时，这条队列必须先听到完整不断的那段 AIFS，计数器才被允许走动。',
      '这段 AIFS 走完时，这条队列在零和它当前窗口之间抽一个整数；窗口从最小竞争窗口（minimum contention window, CWmin）起步。对这四条队列来说，AIFS 结束的那一刻本身就是一个时隙边界，所以计数器在那里就先减一——比退避那一课里的朴素倒数早一个边界，而数过的时隙一样多。',
      '此后每过一个 9 µs 的空闲时隙，计数器再减一；空中一旦有东西，它就原地冻住，等下一段 AIFS 走完再接着数。已经停在零的计数器，在下一个时隙边界上发送，也就是再过 9 µs。',
      '如果同一台电台的两条队列在同一个时隙同时停在零，高的那一类发送，低的那一类则完全按“自己的帧在空中丢了”来处理：记一次重传（retry），窗口朝最大竞争窗口（maximum contention window, CWmax）翻倍，重新抽数。这就是内部碰撞（internal collision），而它一微秒空口时间（airtime）也不花。本场景里每台站点只跑一类流量，所以这一步一次也没触发。',
    ] },
    { kind: 'table', heading: '通话站点的第一帧语音，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['空中重新安静下来', '23.0816 ms'],
      ['这一类的 AIFS = 16 + 2 × 9', '34 µs'],
      ['于是计数器可以从这一刻开始走', '23.1156 ms'],
      ['在 0 与最小竞争窗口 3 之间抽取', '2'],
      ['AIFS 的结束本身就是一个时隙边界', '23.1156 ms · 2 → 1'],
      ['再过一个 9 µs 的空闲时隙', '23.1246 ms · 1 → 0'],
      ['已经停在零的计数器，再等一个时隙边界', '9 µs'],
      ['这一帧语音发出去的时刻', '23.1336 ms'],
      ['同一刻起步的后台队列，此时还欠着', '27 µs'],
    ] },
  ],
  sources: [
    '四个接入类别及其默认参数见 IEEE Std 802.11-2024 的 Table 9-194（EDCA 参数集元素，§9.4.2.28）；AIFS[AC] = aSIFSTime + AIFSN × aSlotTime 见 §10.23.2.4，其中 16 µs 与 9 µs 取自 §17.4.4。',
    '内部碰撞的规则——高优先级类别发送，低优先级类别按外部碰撞进入退避——见 §10.23.2.2。',
    '随机种子、三台站点及它们的业务模型，都是本仿真器的模型取值，而非标准中的数值。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Caller (VO)', 'sta', 3.5, 5, 'he', 'voice'),
    node('sta-2', 'Uploader (BE)', 'sta', 6.5, 5, 'he', 'saturated'),
    node('sta-3', 'Backup (BK)', 'sta', 5, 6.5, 'he', 'backup'),
  ]),
  // The other two jumps of the old list — the background station's first frame and the
  // uploader's first EIFS — went to `edca-cost` with the material they anchor.
  jumps: [
    J('第一次 VO 接入', firstVo),
  ],
  observe: [
    '把鼠标悬在通话站点的倒数色块上：它们标着 AC_VO，块上的窗口从不宽过 7。备份站点的块标着 AC_BK，从不窄于 15，而且上面那段静默是 79 µs。',
    '悬在色块之前那段等待上：通话站点的每一段都是 34 µs，标着 AIFS；上传站点的每一段是 43 µs。整轮下来，这两个数一次也没变过。',
  ],
  tryThis: [
    '把上传站点的业务也改成语音再载入：两条语音队列现在从同一个极小的范围里抽数，它们互相碰撞的频率比之前高得多。',
  ],
  quiz: [
    {
      q: '语音队列究竟是怎么跑到后台队列前面的？',
      options: [
        '接入点（access point, AP）优先服务语音站点',
        '它开始倒数前要听的静默更短，而且倒数值是从更窄的范围里抽的',
        '语音帧可以把正在发送的东西挤开',
      ],
      answer: 1,
      explain: '两个数，没有调度器：一个能更早开始数、又从更小的数开始数的类别，多数时候会更早数到零。',
    },
    {
      q: '后台这一类的 AIFSN 是 7。它每一轮必须先听到多久的安静？',
      options: [
        '7 µs',
        '63 µs',
        '79 µs',
      ],
      answer: 2,
      explain: '16 + 7 × 9 = 79 µs。同一个式子换一个 AIFSN，就得到四类各自的静默；语音的 2 个时隙给出 34 µs。',
    },
  ],
}
