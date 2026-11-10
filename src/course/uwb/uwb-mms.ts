/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Sixteen milliseconds of energy.
 *
 * The first lesson of the 802.15.4ab tier, in the standard-first shape (2026-11-10): ① what the
 * TG4ab proposals the draft grew from say about multi-millisecond ranging — the energy budget
 * (15-22/0205r0), the fragment and its RMARKER (15-23/0100r2), the ranging cycle and its
 * narrowband messages (15-22/0381r5) — with the document each point comes from; ② where this
 * simulator follows them and where not (the one-to-many round spaces a device's fragments
 * (R + 1) slots apart instead of the proposal's 1 200 RSTU, audit #22, still open under W5);
 * ③ five guided runs on the two-wall hall.
 *
 * The room is built so that one 4z frame cannot cross it: three anchors in the first bay, the
 * tag in the third, two brick partitions and 24 dB between them. Every fragment lands about
 * seven decibels under the receiver, and only the combined train is detected.
 *
 * `uwb-mms-numbers` loads exactly this scene and these variants. Every figure the labs print is
 * read back out of the lesson text and compared with a run in tests/course/uwb-mms.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import { mmsSet } from '../../uwb/mms'
import { J, anchor, firstNbPoll, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain, twoWallLab, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/**
 * Which scene the lesson runs: the draft's own ranging-cycle default (X = 8) as a **one-to-many**
 * round — one train from the tag, answered by all three anchors — the same cycle with half the
 * train, one of the mandatory parameter sets (X = 16 on a shorter fragment), ordinary 4z two-way
 * ranging in the same room, or the pair round this lesson ran before one-to-many existed.
 *
 * Only `base` is one-to-many. `four`, `rsf1`, `twr` and `pairwise` are pair rounds, and
 * `pairwise` is byte for byte the scene that used to be the base — which is why the recorded
 * hash that moved is the base's alone.
 */
export type UwbMmsVariant = 'base' | 'four' | 'rsf1' | 'twr' | 'pairwise'

/**
 * The three anchors, all in the first bay of the hall and all behind both brick partitions
 * from the tag. They are placed so that the three of them are as nearly equidistant as the bay
 * allows — 13.04, 13.04 and 12.76 m — because the lesson's whole subject is one threshold: at
 * X = 4 every one of the three has to fail, and at X = 8 every one has to succeed. An anchor
 * pushed up against the first partition would be 8.58 m away, 3.6 decibels louder, and would
 * go on ranging on half a train while the other two heard nothing.
 *
 * Each crystal is set rather than drawn, so the ratio the trains measure has a known truth to
 * be checked against: the tag at +20 ppm and the anchors at −20, 0 and +10 give ratios of 40,
 * 20 and 10 ppm at the tag.
 */
export const MMS_ANCHORS: { id: string; name: string; x: number; y: number; ppm: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5, ppm: -20 },
  { id: 'anchor-2', name: 'Anchor 2', x: 0.5, y: 7.5, ppm: 0 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.3, y: 4.0, ppm: 10 },
]
/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The tag, in the third bay: 12.5 m and two brick walls from the nearest anchor. */
export const TAG_POS = { x: 13.0, y: 4.0, ppm: 20 }

/**
 * Three anchors and one tag on an MMS session, on the 600 RSTU (0.5 ms) slot the draft's
 * §1.1.1 asks for and the simulator's own 200 ms block. `report: 'responder'` puts the range
 * on the tag's lane, where the block fix needs it; `nbChannels: [3]` is the draft's default
 * control channel, in UNII-3, where there is no Wi-Fi in this room to share with and listen
 * before talk is not required. NLOS is on, and the two brick walls charge for it.
 */
export function uwbMmsScenario(variant: UwbMmsVariant = 'base'): Scenario {
  const phy = variant === 'four' ? { rsfs: 4 as const } : variant === 'rsf1' ? mmsSet('rsf-1') : {}
  return uwbSc(
    twoWallLab(),
    [
      ...MMS_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z, a.ppm)),
      uwbTag('tag-1', 'Tag', TAG_POS.x, TAG_POS.y, TAG_Z, TAG_POS.ppm),
    ],
    variant === 'twr'
      ? { mode: 'twr', method: 'ss', slotRstu: 600, aoa: false, nlos: true }
      : {
        mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true,
        mms: {
          ...DEFAULT_UWB_SESSION.mms, ...phy, nbChannels: [3], report: 'responder',
          oneToMany: variant === 'base',
        },
      },
  )
}

export const uwbMms: Lesson = {
  id: 'uwb-mms',
  module: 28,
  title: '十六毫秒的能量',
  why: '法规限制的是超宽带（ultra-wideband, UWB）发射在每一毫秒内的平均功率，换算为每 500 MHz 每毫秒 37 nJ；一帧普通测距帧只占用不到一毫秒，加长它也不能提高到达电平。多毫秒（multi-millisecond, MMS）测距不在 IEEE Std 802.15.4-2024 里，出自 P802.15.4ab 草案，本课依据草案所源自的 TG4ab 提案讲解：发送方把测距分组拆成若干个片段（fragment），每毫秒发一个，每个片段只含一段供打时间戳的序列，称为测距序列片段（ranging sequence fragment, RSF）；接收方事先由一部窄带（narrowband, NB）射频得知这些片段何时到达，把它们合起来判决。时间戳取在第一个片段的第一个脉冲上。窄带射频承载 Poll、Response 与 Report 三种控制消息，宽带射频只发送片段。本课的场景里，两道砖墙使每个片段到达时比接收机的灵敏度（sensitivity）低约 7 dB，普通双向测距一次也不能完成；八个片段合起来超过灵敏度 1.77 dB，三个锚点（anchor）每块都测得距离，四个片段则一次也测不到。测得距离不等于测得准确：穿墙的首径（first path）在本仿真器里每道墙延迟 2 ns，每条距离都偏长同样的 1.199 m，定位继承这一偏差。',
  outcomes: [
    '说出多毫秒测距的哪些内容出自哪一份 TG4ab 提案，以及它们不在已发布的标准里',
    '说出一个测距周期的三个阶段，以及哪些消息由窄带射频承载',
    '分清本仿真器的哪些做法照提案、哪些是它自己的取值或取法，并从日志里读出一串片段的判定',
  ],
  needs: ['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'MMS', plain: '多毫秒：把一个测距分组分散到若干毫秒中发送，而不是一次发完' },
    { term: 'fragment', plain: '这个分组在某一毫秒内发送的部分，单独发出，之后再合起来' },
    { term: 'RSF', plain: '测距序列片段：其中只包含用于取时间戳的那段序列，不含其他内容' },
    { term: 'RIF', plain: '测距完整性片段：承载加扰时间戳序列、用于完整性校验的片段——本场景一个也不发' },
    { term: 'sensitivity', plain: '灵敏度：接收机自身的门限，本课是 −93 dBm，即它仍能从中取出时间戳的最弱电平' },
    { term: 'margin', plain: '余量：一串片段合起来的电平高出灵敏度多少；为正即检出，为负则没有任何结果' },
  ],
  standard: [
    { heading: '出处：草案与提案，不是已发布的标准', text: 'IEEE Std 802.15.4-2024 里没有多毫秒测距。它属于 P802.15.4ab 草案；草案只对会员开放，下面各条依据 TG4ab 的三份公开文稿：15-22/0205r0 论证能量预算；15-23/0100r2 是片段与窄带物理层（physical layer, PHY）的文本提案；15-22/0381r5 是测距周期与窄带消息的文本提案。这些是提案文本，现行草案可能有改动，所以每一条都注明出自哪一份。' },
    { heading: '能量预算（15-22/0205r0）', text: '法规把超宽带发射限制为每 500 MHz 每毫秒 37 nJ。提案据此指出：距离远或首径严重衰减时，一帧普通测距帧的能量不足；把多个各含 37 nJ 的序列片段合起来使用，可以改善测距性能，前提是接收机事先与发送方的载波和定时同步，为此需要一部与超宽带射频紧耦合的窄带射频。' },
    { heading: '片段的结构（15-23/0100r2）', text: '多毫秒分组由片段组成。测距序列片段（RSF）由一个测距序列符号（symbol）重复若干次构成，重复次数取 32、40、48、64、128 或 256；符号由两段长 64 的序列加上可选的零间隔组成，再乘以扩频因子 4。一个 RSF 里只有这段序列，没有前导码（preamble）、头部字段或数据。测距完整性片段（RIF）承载加扰时间戳序列（scrambled timestamp sequence, STS），用于完整性校验。只含 RSF 的分组，片段数 X 取 1、2、4、8 或 16。' },
    { heading: '时间戳的位置（15-23/0100r2）', text: 'RSF 的测距标记定义为第一个 RSF 中第一个脉冲的峰值。一个多毫秒分组只有这一个测距标记，位于分组的开头；发送时间戳与接收时间戳都以它为准。' },
    { kind: 'steps', heading: '一个测距周期，按提案 15-22/0381r5 §1.1：逐步说明', items: [
      '控制阶段：发起方在测距轮（ranging round）第一个时隙的开头，用窄带射频发出 Poll。Poll 窗口缺省为 2 个时隙（1 ms），可取 1 到 16 个时隙。',
      '应答方收到 Poll 后，在 Poll 窗口之后的时隙里用窄带射频发回 Response；发出 Response 的应答方进入测距阶段。发起方收不到 Response，就终止这个测距周期。',
      '测距阶段：发起方与应答方各自从约定的时隙偏移开始，以 1 200 RSTU（ranging scheduling time unit，1 ms）的固定间隔发出至多 X 个 RSF；X 的缺省值为 8，测距阶段缺省为 20 个时隙（10 ms）。',
      '设备收完测距阶段的全部片段之后，若需要向对端报告，就生成测距报告。',
      '报告阶段：应答方用窄带 Report（消息号 0x07）发回 5 个字节的回复时延（reply time），发起方的 Report（0x06）携带 5 个字节的转向时间。',
      '时隙、测距轮与测距块（ranging block）的长度都应取 300 RSTU（250 µs）的整数倍；时隙长度的缺省值为 600 RSTU（0.5 ms）。',
    ] },
    { heading: '一对多（15-22/0381r5 表 1.6.3.1）', text: '提案为一对多测距另设一组消息：一对多 Poll（0x10）列出应答方的数目、每个应答方的时隙数和每个应答方 3 个字节的地址；每个应答方各回一条一对多 Response（0x11），各发一条一对多 Report（0x12）。' },
    { heading: '窄带射频与时间戳的置信度', text: '窄带消息使用 IEEE Std 802.15.4-2024 第 13 章的 O-QPSK（offset quadrature phase-shift keying）物理层（250 kb/s）；提案 15-22/0381r5 把它放在 UNII-3 与 UNII-5 频段的 2.5 MHz 信道上，控制与报告信道的允许列表（allow list）缺省为 3 号信道。每个测距计数值附带一个字节的品质因数（figure of merit, FoM），给出时间戳落在某个置信区间内的置信水平（标准 §10.29.1.7）；怎样估计由实现决定，标准里没有「路径被遮挡」这一标记。' },
  ],
  implementation: [
    { topic: '片段的长度', standard: '序列符号重复若干次，扩频因子 4（15-23/0100r2）', sim: '本场景重复 40 次，每个符号 4 × (128 + 2 × 64) 个码片（chip），一个片段 40 960 个码片，即 82.051 µs。', kind: 'faithful' },
    { topic: '片段的功率', standard: '每 500 MHz 每毫秒 37 nJ（15-22/0205r0 引述的法规）', sim: '每个片段都用满一毫秒的 37 nJ，功率 = 37 nJ ÷ 片段长度；不核对峰值功率限制，也不累计一毫秒里实际发出的能量。', kind: 'choice' },
    { topic: '片段数', standard: 'X 取 1、2、4、8、16，测距周期的缺省值为 8（15-23/0100r2，15-22/0381r5）', sim: '基准场景 X = 8；「四个片段」变体 X = 4；「参数集 rsf-1」变体采用提案 15-23/0502r3 的一个参数集（parameter set），X = 16。', kind: 'value' },
    { topic: '同一台设备两个片段的间隔', standard: '1 200 RSTU，即 1 ms（15-22/0381r5 §1.1）', sim: '成对轮次照此为 1 ms；一对多轮次里标签（tag）与三个锚点轮流占用片段时隙，同一台设备的片段相隔 (应答方数 + 1) 个时隙，即 2 ms。这是待改正的偏差。', kind: 'differs' },
    { topic: '测距标记', standard: '第一个 RSF 中第一个脉冲的峰值（15-23/0100r2）', sim: '发送与接收时间戳都取在第一个片段上；接收时间戳到整串判定之后才输出。', kind: 'faithful' },
    { topic: '接收机怎样合并与判决', standard: '提案未规定', sim: '取收到的第一个片段的电平，加 10·log10(收到的片段数)，再减去 −93 dBm 的灵敏度；差值不为负即判为检出。这是理想的等量相加，不计相位误差。', kind: 'choice' },
    { topic: '控制阶段', standard: 'Poll、Response 各占一个窗口，缺省 2 个时隙；收不到 Response 就终止周期（15-22/0381r5 §1.1）', sim: '照此：每条窄带消息固定占两个时隙；只有完成 Poll 与 Response 交互的那一对才进入测距阶段。', kind: 'faithful' },
    { topic: '时隙长度', standard: '300 RSTU 的整数倍，缺省 600 RSTU（15-22/0381r5）', sim: '本场景 600 RSTU，即 500 µs；编辑器拒绝不是 300 RSTU 整数倍的取值。测距块长 200 ms 是本仿真器取的值。', kind: 'value' },
    { topic: '报告与距离', standard: '应答方的 Report 携带回复时延（15-22/0381r5 表 1.6.3.1）；单边双向测距（single-sided two-way ranging, SS-TWR）的计算见标准 §10.29.1.2.2', sim: '本场景只有锚点发 Report，标签据此按单边双向测距计算距离，并用整串片段测得的时钟比值（clock ratio）修正回复时延。', kind: 'faithful' },
    { topic: '穿墙的首径', standard: '标准不规定传播模型', sim: '每道砖墙衰减 12 dB、使首径延迟 2 ns；双向测距消不掉这部分延迟。', kind: 'value' },
    { topic: '品质因数', standard: '置信水平与置信区间，估计方法由实现决定（§10.29.1.7）', sim: '非视距（non-line-of-sight, NLOS）的路径固定填一个较低的值，日志里显示为「75 % within 12 ns」。', kind: 'choice' },
    { topic: '完整性片段', standard: 'RIF 承载 STS，用于完整性校验（15-23/0100r2）', sim: '不生成 STS 序列，也不做比对；本场景一个 RIF 也不发。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '普通双向测距穿不过这个房间',
      variant: 2,
      steps: [
        '载入「以 4z 作对照」：同样的房间、同样的节点，改用普通的单边双向测距。',
        '运行 1.3 秒，统计测距记录与超时记录。',
      ],
      expect: '一次测距也没有，超时记录 42 条：21 条是锚点等不到 Poll，21 条是标签等不到应答。Poll 到达锚点时只有 −110.80 dBm，比 −93 dBm 的灵敏度低 17.8 dB。',
      meaning: '一帧普通测距帧只有一次机会被检出（①的能量预算）；这个房间里它的电平不够，而这种模式没有任何合并机制。',
    },
    {
      heading: '一轮测距的时间线',
      jump: 0,
      steps: [
        '载入本课场景，跳到开启这一轮的窄带 Poll。',
        '按下表逐条找到这一轮的记录。',
      ],
      blocks: [
        { kind: 'table', heading: '第 0 块的那一轮', head: ['时刻', '日志行'], rows: [
          ['0 ms', 'tag-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)'],
          ['1.000 ms', 'anchor-1 → tag-1 NBRESP 12 B @0.25 Mbps (576.0 µs)'],
          ['4.000 ms', 'tag-1 → * UWBRSF 0 B @0 Mbps (82.1 µs)'],
          ['18.500 ms', 'anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.997 ppm · responders: anchor-1, anchor-2, anchor-3'],
          ['20.000 ms', 'anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)'],
          ['20.608 ms', 'tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)'],
          ['26.000 ms', 'tag-1 position (14.24, 4.08) m, true (13.00, 4.00), error 1.24 m, GDOP 2.93, 3 anchors'],
        ] },
      ],
      expect: '这一轮共 52 个时隙、26 ms。窄带 Poll 在 0 ms 发出，三个锚点的 Response 在 1、2、3 ms；第一个片段在 4 ms，每个片段 0 字节；第一条判定在 18.500 ms，第一条 Report 在 20.000 ms，第一个距离在 20.608 ms。',
      meaning: '控制阶段、测距阶段、报告阶段的顺序照提案 15-22/0381r5（①）；片段不承载任何数据，回复时延要等窄带 Report 送到，标签才能算出距离。',
    },
    {
      heading: '一串片段的判定：八个与四个',
      jump: 2,
      more: [0],
      steps: [
        '跳到对端如何判定这一串片段，读出收到几个片段、每个的电平、合成增益（combining gain）与余量（margin）。',
        '再载入「四个片段」，读同一条判定。',
      ],
      blocks: [
        { kind: 'table', heading: '同一个锚点的判定，两种片段数', head: ['片段数', '收到', '每个片段', '合成增益', '余量', '结果', '1.3 秒内的测距'], rows: [
          ['8', '8/8', '−100.26 dBm', '+9.03 dB', '+1.77 dB', '检出', '21'],
          ['4', '4/4', '−100.26 dBm', '+6.02 dB', '−1.24 dB', '丢失', '0'],
        ] },
      ],
      expect: '两种情况下每个片段的电平相同，也都全部收到；只有合并后的和相差 3.01 dB，余量由正变负，四个片段时整段运行一次测距也没有。',
      meaning: '合并与判决的方式是本仿真器的取法（②）：理想的 10·log10(X) 增益与 −93 dBm 的硬门限。提案只规定片段数的取值（①）。',
    },
    {
      heading: '一对多与成对：片段间隔与一块的长度',
      more: [3],
      steps: [
        '在本课场景里读标签相邻两个片段的发送时刻。',
        '再载入「每次只与一个锚点测距」，读同样的量，并对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '同一个块，两种安排', head: ['量', '一轮询问三个锚点', '每轮只询问一个'], rows: [
          ['同一台设备相邻两个片段的间隔', '2 ms', '1 ms'],
          ['一轮的时隙数', '52', '28'],
          ['一轮的时长', '26 ms', '14 ms'],
          ['每块的轮数', '1', '3'],
          ['本块得出定位的时刻', '26 ms', '42 ms'],
        ] },
      ],
      expect: '一对多的一轮里，标签的片段每 2 ms 一个；成对轮次里每 1 ms 一个。一对多用一轮完成三个距离，定位在 26 ms 得出；成对要三轮，定位推迟到 42 ms。',
      meaning: '成对轮次的 1 ms 间隔照提案（①）；一对多轮次的 2 ms 是本仿真器与提案不同之处（②）。',
    },
    {
      heading: '测得距离，但偏长',
      jump: 4,
      steps: [
        '跳到第一次测距，对照真实距离读出差值。',
        '再看第 0 块的定位结果。',
      ],
      expect: '三条距离 14.26、14.22、13.97 m，真值 13.04、13.04、12.76 m，都偏长约 1.2 m；按 2 ns × 2 道墙的往返延迟算，偏差是 1.199 m。定位 (14.24, 4.08) m，误差 1.24 m。',
      meaning: '这一偏差来自本仿真器的穿墙延迟（②），每轮相同，是固定偏移而不是噪声；片段只使测量得以完成，不使它更准确。',
    },
  ],
  sources: [
    'P802.15.4ab 草案（截至 2026 年 9 月，投票稿为 D05，仍在 Sponsor 投票复审中）。草案仅对会员开放，本课依据 TG4ab 文稿：15-22/0205r0（每 500 MHz 每毫秒 37 nJ 的能量预算、紧耦合的窄带射频）、15-23/0100r2（RSF 与 RIF 的结构、重复次数与片段数的取值、RSF 的测距标记）、15-22/0381r5（§1.1 测距周期、表 1.2.3.2 的缺省值、表 1.6.3.1 的窄带消息、300 RSTU 整数倍的规定）。已投票的 D05 可能与此不同。',
    'IEEE Std 802.15.4-2024：第 13 章（O-QPSK 物理层）、§10.29.1.2.2（单边双向测距）、§10.29.1.7（品质因数）。',
    '本仿真器的取值与取法：22 × 8 m 的大厅、两道各 12 dB 的砖墙、每道砖墙 2 ns 的首径延迟、−93 dBm 的灵敏度、10·log10(X) 的合并规则与硬判决、200 ms 的测距块、一对多轮次 2 ms 的片段间隔。',
  ],
  limits: [],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: '四个片段', scenario: () => uwbMmsScenario('four') },
    { label: '参数集 rsf-1', scenario: () => uwbMmsScenario('rsf1') },
    { label: '以 4z 作对照', scenario: () => uwbMmsScenario('twr') },
    { label: '每次只与一个锚点测距', scenario: () => uwbMmsScenario('pairwise') },
  ],
  jumps: [
    J('开启这一轮的窄带 Poll 帧', firstNbPoll),
    J('第一串片段里的第一个', firstUwbRsf),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('结束这一轮的窄带 Report 帧', firstNbReport),
    J('两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么不直接发送一帧更长的测距帧，而要发送一串片段？',
      options: [
        '更长的帧无法放入一个时隙',
        '法规限制的是每毫秒内的能量，帧更长并不能使电平更高；一串片段是逐毫秒地使用每一毫秒的额度，再由接收方合起来',
        '接收机无法为长帧打时间戳',
      ],
      answer: 1,
      explain: '15-22/0205r0：每 500 MHz 每毫秒 37 nJ。任何一毫秒里的能量都不能更多，但占用多少个毫秒不受限制。',
    },
    {
      q: '一串片段的测距标记在哪里？',
      options: [
        '最后一个片段的最后一个脉冲上',
        '第一个 RSF 中第一个脉冲的峰值',
        '每个片段各有一个，取平均',
      ],
      answer: 1,
      explain: '15-23/0100r2 把 RSF 的测距标记定义为第一个 RSF 中第一个脉冲的峰值，一个分组只有这一个。',
    },
    {
      q: '哪一项是本仿真器与提案不同的地方？',
      options: [
        '成对轮次里同一台设备的片段每 1 ms 发一个',
        '一对多轮次里同一台设备的片段每 2 ms 发一个',
        '时隙长度取 600 RSTU',
      ],
      answer: 1,
      explain: '15-22/0381r5 §1.1 规定片段以 1 200 RSTU（1 ms）的固定间隔发出；本仿真器的一对多轮次让标签与三个锚点轮流占用片段时隙，间隔成了 2 ms。',
    },
  ],
}
