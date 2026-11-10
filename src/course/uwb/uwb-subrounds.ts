/**
 * UWB Tier 3 · M15 · The other control plane · Taking turns instead of interleaving: the
 * non-interleaved sub-round of the P802.15.4ab draft (§10.39.7).
 *
 * Standard-first shape (2026-11-10): ① what the draft says about non-interleaved sub-rounds (as
 * quoted and revised in 15-25/0292r1), and how the adopted resolution 15-25/0681r1 carries the reply
 * time — a 5-octet Predicted Reply Time in the Response Compact frame, non-interleaved only — in
 * place of the fixed reply time and reversed order of 15-25/0224r2 and 15-25/0556r2; ② how this
 * simulator implements it: one device to a sub-round, an interleaved layout that departs from the
 * draft (audit #22), no Predicted Reply Time, and two variants that still run the superseded
 * proposals (audit #6, W5); ③ four guided runs.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-subrounds.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import type { TimingSpec } from '../diagram'
import {
  MMS_DRAFT_DEFAULTS, MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_SLOTS_PER_MS, mmsLayout, rsfNs,
  type MmsPhy,
} from '../../uwb/mms'
import { rstuNs } from '../../uwb/session'
import {
  J, anchor, firstUwbRange, firstUwbRsf, firstUwbTrain, rangingLab, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** Which shape the scene runs. */
export type UwbSubroundsVariant = 'base' | 'interleaved' | 'fixed' | 'reversed'

/** Three anchors down the tag's line, at its own height, 3 m apart: the distances are meant to be
 * read straight off the log, and the lesson is about the schedule rather than the geometry. */
export const SUBROUND_ANCHORS: { id: string; name: string; x: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 4 },
  { id: 'anchor-2', name: 'Anchor 2', x: 7 },
  { id: 'anchor-3', name: 'Anchor 3', x: 10 },
]
export const SUBROUND_Z = 1.0
export const SUBROUND_TAG_X = 1
/** The slot every figure in this lesson is counted in: the draft's own 600 RSTU. */
export const SUBROUND_SLOT_RSTU = 600

/**
 * Config 1 with a zero-length control phase — the shape the draft's own non-interleaved figure
 * draws (15-25/0194r0 slide 17), where the packet is its own poll and response and the report phase
 * is all that is left of the control plane. It is also the shape the fixed reply time is worth
 * something in: there is exactly one frame in the round besides the fragments, and that option is
 * what removes it. 4ab draft 15-25/0194r0, 15-25/0292r1
 */
const SHAPE = {
  control: 'uwbd', uwbdControl: 'none', nbChannels: [] as number[], nbLbt: 'off',
} as const

/**
 * The 22 m hall, three anchors and one tag, on the draft's 600 RSTU slot and the session's own
 * train (X = 8 RSFs, no RIF). NLOS off.
 *
 * `base` and `interleaved` are one-to-many, because the fragment gap only parts company between the
 * two shapes when there is more than one responder. `fixed` and `reversed` are non-interleaved like
 * the base; `fixed` has to be pairwise, because the draft carries the reply time in a *one-to-one*
 * Response Compact frame and a shared constant would have every responder answer at the same
 * instant — the schema refuses the combination.
 */
export function uwbSubroundsScenario(variant: UwbSubroundsVariant = 'base'): Scenario {
  const mms = variant === 'interleaved'
    ? { nonInterleaved: false, oneToMany: true }
    : variant === 'fixed'
      ? { nonInterleaved: true, oneToMany: false, fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT }
      : { nonInterleaved: true, oneToMany: true, reversedOrder: variant === 'reversed' }
  return uwbSc(
    rangingLab(),
    [
      ...SUBROUND_ANCHORS.map((a) => anchor(a.id, a.name, a.x, 4, SUBROUND_Z)),
      uwbTag('tag-1', 'Tag', SUBROUND_TAG_X, 4, SUBROUND_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: SUBROUND_SLOT_RSTU, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...SHAPE, ...mms },
    },
  )
}

/** The lesson's own train, as an `MmsPhy`, so the figures come from `mmsLayout` and not from here. */
const SUBROUND_PHY = (nonInterleaved: boolean): MmsPhy => ({
  rsfs: DEFAULT_UWB_SESSION.mms.rsfs, rifs: DEFAULT_UWB_SESSION.mms.rifs,
  nMsr: DEFAULT_UWB_SESSION.mms.nMsr, gap: DEFAULT_UWB_SESSION.mms.gap,
  stsLen: DEFAULT_UWB_SESSION.mms.stsLen, gapMs: DEFAULT_UWB_SESSION.mms.gapMs,
  ...MMS_DRAFT_DEFAULTS, control: 'uwbd', uwbdControl: 'none', nonInterleaved,
})

/** How many responders the scene holds — the number that moves the interleaved fragment gap. */
export const SUBROUND_RESPONDERS = SUBROUND_ANCHORS.length

/**
 * Both shapes of a one-to-many round on one axis, drawn from `mmsLayout` itself: two lanes each —
 * the initiator's column and all three responders' — so the figure shows both differences at once,
 * the gap inside one column and the length of the whole round. Every span is placed at the slot the
 * layout puts it in, so the picture cannot disagree with the schedule the engine runs.
 *
 * Lane labels are kept to four characters because `layoutTiming` caps its gutter; the caption is
 * where 穿插 and 轮流 are tied back to the interleaved and non-interleaved shapes.
 */
export function uwbSubroundsTiming(): TimingSpec {
  const slotUs = rstuNs(SUBROUND_SLOT_RSTU) / 1000
  const lanesFor = (nonInterleaved: boolean, tag: string): TimingSpec['lanes'] => {
    const phy = SUBROUND_PHY(nonInterleaved)
    const l = mmsLayout(phy, SUBROUND_RESPONDERS, MMS_SLOTS_PER_MS)
    const fragUs = rsfNs(phy.nMsr, phy.gap) / 1000
    const column = (side: 'initiator' | 'responder', r: number, accent: boolean) =>
      Array.from({ length: phy.rsfs }, (_, m) => {
        const from = l.fragmentSlot(side, 'rsf', m, r) * slotUs
        return { fromUs: from, toUs: from + fragUs, tone: accent ? ('accent' as const) : undefined }
      })
    return [
      { label: `${tag} 标签`, spans: column('initiator', 0, true) },
      {
        label: `${tag} 锚点`,
        spans: SUBROUND_ANCHORS.flatMap((_a, r) => column('responder', r, false)),
      },
    ]
  }
  const lanes = [...lanesFor(false, '穿插'), ...lanesFor(true, '轮流')]
  const endUs = Math.max(...lanes.flatMap((x) => x.spans.map((s) => s.toUs)))
  const toUs = Math.ceil(endUs / 4000) * 4000
  return {
    kind: 'timing',
    lanes,
    axis: { fromUs: 0, toUs, ticks: [0, toUs / 2, toUs], unit: 'µs' },
  }
}

/** The first fragment an anchor puts on the air — in the non-interleaved round, the moment the
 * second sub-round opens. */
export const firstResponderFragment = (r: TLRecord): boolean =>
  r.type === 'TX_START' && r.frame.kind === 'uwbRsf' && r.node !== 'tag-1'

export const uwbSubrounds: Lesson = {
  id: 'uwb-subrounds',
  module: 30,
  title: '轮流发送，还是穿插发送',
  why: 'P802.15.4ab 草案（§10.39.7，正在审议）为超宽带（ultra-wideband, UWB）的多毫秒（multi-millisecond, MMS）测距规定了交织与非交织两种形态。非交织形态下，一轮测距分成几个子轮，一个子轮里只有一方发送，它把自己的一列片段（fragment）连续发完，再轮到下一方。非交织的单边双向测距（single-sided two-way ranging, SS-TWR）是两个子轮：发起方发出轮询紧凑帧后不等应答，就发送自己的 MMS 测距包；应答方收到这个包的开头之后开始第二个子轮。回复时间的传送，工作组通过的是决议 15-25/0681r1：非交织形态下，应答方可以在 Response Compact 帧里携带 5 个八位组的预测回复时间（Predicted Reply Time），从而省去单独的报告；2025 年提案的固定回复时间（macMmsFixedReplyTime）与反序（Reversed MMS order）没有被采纳。本仿真器实现了非交织子轮，让标签（tag）与每个锚点（anchor）各占一个子轮，于是一列八个片段只占 7 ms，而按本仿真器的交织排法，三个应答方时它要 14 ms；代价是一轮从 38 个时隙增加到 86 个。本仿真器没有实现预测回复时间，它的「固定回复时间」与「反序」两个变体实现的是那两份被取代的提案，这是待改正的偏差，课里只把它们当作对照来运行。',
  outcomes: [
    '说出草案对非交织子轮的规定：几个子轮、谁先发、应答方何时开始自己的子轮',
    '说出决议 15-25/0681r1 怎样省去回复时间的报告，以及它取代了哪两份提案',
    '读出两种排法下一列片段的间隔与一轮的时隙数，并分清哪些是本仿真器的排法',
  ],
  needs: ['uwb-uwbd', 'uwb-slot-budget'],
  terms: [
    { term: 'non-interleaved sub-round', plain: '非交织子轮：草案 §10.39.7 的形态，一个子轮里只有一方发送，它把整列片段连续发完，再轮到下一方' },
    { term: 'Predicted Reply Time', plain: '预测回复时间：决议 15-25/0681r1 加入 Response Compact 帧的 5 个八位组字段，应答方报告自己将要发送的片段与收到的片段之间 RMARKER 的时间差，只用于非交织形态' },
    { term: 'macMmsFixedReplyTime', plain: '固定回复时间：2025 年提案中的属性，应答方按事先约定的固定间隔发送自己的 MMS 包；没有被采纳，由预测回复时间取代' },
    { term: 'Reversed MMS order', plain: '反序：2025 年提案中的选项，应答方先发送自己的 MMS 包；没有出现在通过的决议里' },
  ],
  standard: [
    { heading: '非交织形态（P802.15.4ab 草案 §10.39.7）', text: '草案写明：一个非交织测距轮（ranging round）可以由一个、两个、三个或四个子轮组成。所用的模式由描述媒体访问控制（medium access control, MAC）配置的 Management MAC Configuration 字段里的 Non-Interleaved Mode 参数指明（草案 §10.39.11.1.3.9）。以下按 TG4ab 文稿 15-25/0292r1 给出的、针对 §10.39.7 意见的修改文字。截至 2026 年 9 月，这部分仍有争议：一项涉及一对多非交织双边测距的意见决议动议以 12/13/1 未获通过（纪要 15-26/0425r0），反对理由是移动场景下的时长与应答方多时的帧长。' },
    { heading: '非交织的单边双向测距：两个子轮（15-25/0292r1）', text: '窄带（narrowband, NB）辅助配置下，发起方发出轮询紧凑帧（poll Compact frame），不等应答方的应答紧凑帧，在轮询紧凑帧开始之后 macMmsRcpPollNSlots 个时隙发送自己的 MMS 测距包；这是第一个子轮，长 macMmsRcpPollNSlots + macMmsRpDuration 个时隙。应答方在收到这个 MMS 包开头之后 macMmsRpDuration 个时隙，以一个应答紧凑帧开始第二个子轮，并在第二个子轮开始之后 macMmsRcpRespNSlots 个时隙发送自己的 MMS 包。是否发送报告是可选的。UWB 驱动配置的非交织形态与此相同，只是控制阶段使用超宽带。' },
    { heading: '一对多（15-25/0292r1）', text: '非交织模式与一对多测距并不互斥，基本的一对多测距也可以按非交织方式进行；文稿的说明是，每个一对多子轮可以看作一个完整的一对一测距轮。非交织模式不适用于基于竞争的一对多测距、时间高效的一对多测距与每个时隙多个测距序列片段（ranging sequence fragment, RSF）的一对多测距。' },
    { heading: '回复时间：预测回复时间（决议 15-25/0681r1，已通过）', text: '决议在 One-to-one Response Compact 帧（草案 §10.39.11.3.6）与 One-to-many Response Compact 帧（草案 §10.39.11.3.10）里增加 Message Control 字段的取值 2：此时 Message Content 是 5 个八位组的 Predicted Reply Time，即在应答方测得的、收到的发起方 MMS 片段与它将在这个应答帧之后发送的 MMS 片段之间 RMARKER（ranging marker）的时间差，单位见 §10.29.1.4。这种格式只用于非交织形态，用来省去单独的回复时间报告。纪要 15-26/0006r0 记录这份决议无异议通过。' },
    { heading: '被取代的提案', text: 'IEEE Std 802.15.4-2024 §10.29.6.5 有固定回复时间的 SS-TWR。2025 年的提案 15-25/0224r2 与 15-25/0556r2 建议把它扩展到 MMS：属性 macMmsFixedReplyTime，默认值为 600 RSTU（ranging scheduling time unit）；以及让应答方先发送的 Reversed MMS order。决议 15-25/0681r1 答复的正是这几条意见，它写明交织形态下的固定回复时间增加实现复杂度而收益很小，不需要增加这个参数，非交织形态改用预测回复时间。反序没有出现在决议里。' },
    { kind: 'steps', heading: '非交织的单边双向测距，按草案：逐步说明', items: [
      '发起方发出轮询紧凑帧（UWB 驱动配置下是控制阶段的 SP0 包），开始第一个子轮。',
      '发起方不等应答，在 macMmsRcpPollNSlots 个时隙之后把自己的 MMS 测距包连续发完，每毫秒一个片段。',
      '应答方收到这个 MMS 包的开头，隔 macMmsRpDuration 个时隙，以应答紧凑帧开始第二个子轮；这个应答帧可以带预测回复时间（Message Control = 2）。',
      '应答方在第二个子轮开始之后 macMmsRcpRespNSlots 个时隙，把自己的 MMS 测距包连续发完。',
      '发起方测得往返时间，结合应答方报告的回复时间算出距离；回复时间已在应答紧凑帧里给出时，不需要单独的报告。',
    ] },
  ],
  implementation: [
    { topic: '非交织子轮', standard: '一个子轮只有一方发送，整列片段连续发完（草案 §10.39.7）', sim: '照此实现：子轮里只有一个发送者，相邻片段的间隔只由时隙长度决定，600 RSTU 的时隙上是 2 个时隙、1 ms。', kind: 'faithful' },
    { topic: '一对多的排法', standard: '可以按非交织方式进行，每个子轮可看作一个一对一测距轮；没有逐条写出排法', sim: '发起方占第一个子轮，三个应答方各占一个子轮，每个子轮 20 个时隙，四个子轮之后是 6 个时隙的报告阶段，一轮共 86 个时隙。', kind: 'choice' },
    { topic: '控制阶段', standard: '每个子轮以轮询或应答紧凑帧开始', sim: '本课的场景用 UWB 驱动配置的零长控制阶段（提案 15-25/0194r0），不发紧凑帧：发起方从本轮第一个时隙开始发送，应答方在自己子轮的边界开始发送。', kind: 'choice' },
    { topic: '交织时的片段间隔', standard: '草案的交织形态里，同一方相邻两个片段相隔 1 ms', sim: '本仿真器与之不同：一对多交织时，每一毫秒为本轮每台设备各留一个时隙，三个应答方时是 4 个时隙，600 RSTU 上就是 2 ms，一列八个片段从 7 ms 拉长到 14 ms。这是待改正的偏差。', kind: 'differs' },
    { topic: '预测回复时间', standard: 'Response Compact 帧里的 5 个八位组 Predicted Reply Time（决议 15-25/0681r1）', sim: '未实现：本课场景没有紧凑帧，回复时间仍放在报告阶段的 SP0 报告里。', kind: 'absent' },
    { topic: '「固定回复时间」变体', standard: '提案 15-25/0224r2 的固定回复时间已被决议 15-25/0681r1 取代', sim: '本仿真器与草案不同：这个变体仍实现被取代的提案——应答方在接收完对方整个 MMS 包之后 600 RSTU 发送，不发回复时间报告；发起方仍照常打开那个报告窗口，于是记录一次超时。这是待改正的偏差。', kind: 'differs' },
    { topic: '「反序」变体', standard: '提案 15-25/0556r2 的反序没有出现在决议里', sim: '本仿真器与草案不同：这个变体仍实现该提案——应答方先发送，发起方自测距阶段开始起隔 600 RSTU 再发送；往返时间与回复时间按「谁先发送」交换测量方。这是待改正的偏差。', kind: 'differs' },
    { topic: '报告阶段', standard: '报告可选', sim: '保留报告阶段：每个应答方两个窗口，一个是它自己的 SP0 报告，一个是发起方发给它的报告。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '两种排法，同一个房间',
      more: [0],
      steps: [
        '载入本课场景，读出 0.000 ms 那一行一轮的时隙数；再载入「交错，一对多」读同一行。',
        '对照下图与下表，比较两种排法下一列片段的间隔、跨度与一轮的长度。',
      ],
      blocks: [
        { kind: 'diagram', heading: '两种排法，按同一时间刻度绘制', spec: uwbSubroundsTiming(), caption: '上两行是交织排法（图中标为“穿插”），下两行是非交织排法（标为“轮流”）；每一对中上面一行是标签的八个片段，下面一行是三个锚点的二十四个片段。' },
        { kind: 'table', heading: '同一个房间，两种排法', head: ['量', '交错，一对多', '非交织，一对多'], rows: [
          ['子轮数', '1', '4'],
          ['测距阶段', '32 时隙', '每子轮 20 时隙'],
          ['报告阶段', '6 时隙', '6 时隙'],
          ['一轮', '38 时隙 · 19 ms', '86 时隙 · 43 ms'],
          ['相邻片段的间隔', '4 时隙 · 2 ms', '2 时隙 · 1 ms'],
          ['一列八个片段的跨度', '14 ms', '7 ms'],
          ['每个 200 ms 测距块（ranging block）的距离数', '6', '6'],
        ] },
      ],
      expect: '0.000 ms 那一行写着 “tag-1 UWB round 0 of block 0 (MMS): 86 slots × 500.0 µs”，交错场景是 38 slots。非交织时标签相邻片段相隔 1 ms，交错时 2 ms；两种排法每块都得到 6 个距离。',
      meaning: '一个子轮只有一个发送者是草案的规定（①），所以间隔与锚点数无关；交错时的 2 ms 来自本仿真器的排法（②，differs）。每块只运行一轮，两种轮次都放得下，所以距离数相同。',
    },
    {
      heading: '子轮的边界',
      jump: 1,
      steps: [
        '跳到第一个锚点开始发送自己一列片段的时刻。',
        '读出标签一列片段的起止、三个锚点与标签各自的判定时刻，以及距离出现的时刻。',
      ],
      expect: '标签的八个片段在 0 到 7 ms 之间发完，第一个锚点在 10.000 ms 开始发送。三个锚点的判定都在 7.500 ms：它们收到的是标签的同一次发送；标签的三条判定在 17.500、27.500、37.500 ms。六个距离出现在 40.118 到 42.618 ms 之间，标签测得的三个距离是 3.01、6.01 与 8.91 m，真值 3、6、9 m。',
      meaning: '发起方先把自己的一列发完、应答方再依次发送，与草案的子轮次序一致（①）；每个应答方各占一个子轮、距离出现在报告阶段，是本仿真器的排法（②）。',
    },
    {
      heading: '被取代的固定回复时间提案',
      variant: 1,
      steps: [
        '载入「固定回复时间（未采纳的提案）」，读出一轮里的 SP0 包个数与标签得出距离的时刻。',
        '在编辑器中关闭固定回复时间再运行一次，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '固定回复时间：关闭与打开', head: ['量', '关闭', '打开（600 RSTU）'], rows: [
          ['一轮中的 SP0 包', '2 个', '1 个'],
          ['发起方何时得出距离', '20.118 ms', '17.500 ms'],
          ['未经修正的距离', '19.89 m', '3.96 m'],
          ['修正后的距离，真值 3.00 m', '3.01 m', '3.12 m'],
        ] },
      ],
      expect: '打开之后应答方不发报告，发起方在 17.500 ms 就得出距离；未经修正的数从 19.89 m 降到 3.96 m，因为回复时间缩短为 600 RSTU，即半毫秒。日志里仍有一行 “tag-1 UWB slot 40: no sp0 from anchor-1”。',
      meaning: '这个变体运行的是已被取代的提案（②，differs）。草案省去回复时间报告的办法是在 Response Compact 帧里报告预测回复时间（①），本仿真器没有实现（②，absent）；那行超时是本仿真器照常打开报告窗口的结果。',
    },
    {
      heading: '反序',
      variant: 2,
      steps: [
        '载入「反序（提案）」，读出六个距离与真值之差。',
      ],
      expect: '六个距离都测得，与真值相差不超过 6.2 cm。',
      meaning: '这个变体同样运行一份没有被采纳的提案（②，differs）：谁先发送，谁就测往返时间，测距算式不变。',
    },
  ],
  sources: [
    'P802.15.4ab 草案 §10.39.7（正在审议，仅对会员开放）：非交织形态由一至四个子轮组成，按 TG4ab 文稿 15-25/0292r1 的引述与修改文字；Non-Interleaved Mode 参数（草案 §10.39.11.1.3.9）。2026 年 9 月的动议以 12/13/1 未获通过，见纪要 15-26/0425r0。',
    '决议 15-25/0681r1（纪要 15-26/0006r0：无异议通过）：One-to-one 与 One-to-many Response Compact 帧（草案 §10.39.11.3.6、§10.39.11.3.10）里的 Predicted Reply Time，只用于非交织形态。',
    '被取代的提案：15-25/0224r2（固定回复时间）、15-25/0556r2（固定回复时间与反序）。IEEE Std 802.15.4-2024：§10.29.6.5（固定回复时间的 SS-TWR）、§10.29.1.4（时间单位）。',
    '本仿真器的取值与取法：一对多非交织时每台设备一个子轮、每个子轮 20 个时隙、报告阶段 6 个时隙；交错时每毫秒为每台设备留一个时隙（与草案不同，待改正）；零长控制阶段的场景；两个变体仍实现被取代的提案（待改正）。',
  ],
  limits: [],
  scenario: () => uwbSubroundsScenario('base'),
  variants: [
    { label: '交错，一对多', scenario: () => uwbSubroundsScenario('interleaved') },
    { label: '固定回复时间（未采纳的提案）', scenario: () => uwbSubroundsScenario('fixed') },
    { label: '反序（提案）', scenario: () => uwbSubroundsScenario('reversed') },
  ],
  jumps: [
    J('标签那一列片段的第一个', firstUwbRsf),
    J('第一个锚点开始发送自己的一列片段', firstResponderFragment),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('轮末得出的第一个距离', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '在有三个锚点的一轮中，非交织排法下同一列片段的相邻间隔是 1 ms，本仿真器的交错排法下是 2 ms。原因是什么？',
      options: [
        '两种排法都只由时隙长度决定',
        '非交织子轮里只有一个发送者，间隔只由时隙长度决定；本仿真器交错时每一毫秒要为每台设备各留一个时隙',
        '片段本身变长了',
      ],
      answer: 1,
      explain: '交错时的间隔是 (应答方数 + 1) × 时隙，这是本仿真器的排法，与草案成对交织时的 1 ms 不同；非交织时是 ⌈1 200 RSTU / 时隙⌉ × 时隙。',
    },
    {
      q: '按通过的决议 15-25/0681r1，非交织形态下怎样省去回复时间的单独报告？',
      options: [
        '双方事先约定一个固定回复时间',
        '应答方在 Response Compact 帧里携带预测回复时间（Message Control = 2）',
        '让应答方先发送',
      ],
      answer: 1,
      explain: '固定回复时间与反序是被取代的提案。决议写明不需要固定回复时间参数，改由应答方报告预测的回复时间。',
    },
  ],
}
