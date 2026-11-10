/**
 * UWB Tier 3 · M15 · The other control plane · Taking turns instead of interleaving: the
 * non-interleaved sub-round of the P802.15.4ab draft (§10.39.7), and the Predicted Reply Time it
 * makes possible.
 *
 * Standard-first shape. ① the two shapes the draft defines — interleaved (the responder 500 µs
 * behind the initiator, a sub-round per responder one-to-many) and non-interleaved (§10.39.7, as
 * quoted and revised in 15-25/0292r1) — and the adopted resolution 15-25/0681r1: a 5-octet Predicted
 * Reply Time in the Response Compact frame, non-interleaved only, which superseded the fixed reply
 * time and reversed order of 15-25/0224r2 and 15-25/0556r2; ② how this simulator implements both
 * shapes and the Predicted Reply Time (2026-11-11, W5: audit #6 and #22 fixed); ③ three guided runs.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-subrounds.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import type { TimingSpec } from '../diagram'
import {
  MMS_DRAFT_DEFAULTS, MMS_SLOTS_PER_MS, mmsLayout, rsfNs,
  type MmsPhy,
} from '../../uwb/mms'
import { rstuNs } from '../../uwb/session'
import {
  J, anchor, firstUwbRange, firstUwbRsf, firstUwbTrain, rangingLab, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** Which shape the scene runs. */
export type UwbSubroundsVariant = 'base' | 'interleaved' | 'sp0' | 'predicted'

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
 * is all that is left of the control plane. 4ab draft 15-25/0194r0, 15-25/0292r1
 */
const SHAPE = {
  control: 'uwbd', uwbdControl: 'none', nbChannels: [] as number[], nbLbt: 'off',
} as const

/**
 * The 22 m hall, three anchors and one tag, on the draft's 600 RSTU slot and the session's own
 * train (X = 8 RSFs, no RIF). NLOS off.
 *
 * All four are one-to-many. `base` and `interleaved` are the two shapes on a zero-length control
 * phase. `sp0` and `predicted` are non-interleaved with an SP0 control phase — a Response Compact
 * frame needs a control phase to ride in — and `predicted` has the responders send the Predicted
 * Reply Time in it (resolution 15-25/0681r1) instead of reporting their reply time.
 */
export function uwbSubroundsScenario(variant: UwbSubroundsVariant = 'base'): Scenario {
  const mms = variant === 'interleaved'
    ? { nonInterleaved: false, oneToMany: true }
    : variant === 'sp0' || variant === 'predicted'
      ? { nonInterleaved: true, oneToMany: true, uwbdControl: 'sp0' as const, predictedReplyTime: variant === 'predicted' }
      : { nonInterleaved: true, oneToMany: true }
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
      // Interleaved, the initiator sends its column once in every responder's sub-round (15-25/0213r2).
      {
        label: `${tag} 标签`,
        spans: nonInterleaved
          ? column('initiator', 0, true)
          : SUBROUND_ANCHORS.flatMap((_a, r) => column('initiator', r, true)),
      },
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
  why: 'P802.15.4ab 草案（§10.39.7，正在审议）为超宽带（ultra-wideband, UWB）的多毫秒（multi-millisecond, MMS）测距规定了交织与非交织两种形态。交织形态下，发起方每毫秒发一个片段（fragment），应答方的片段在其后 500 µs；一对多时每个应答方各占一个这样的子轮。非交织形态下，一个子轮里只有一方发送，它把自己的一列片段连续发完，再轮到下一方：非交织的单边双向测距（single-sided two-way ranging, SS-TWR）里，发起方发出轮询紧凑帧后不等应答就发送自己的 MMS 测距包，应答方收完之后才开始自己的子轮。正因为应答方发应答帧时已经收完发起方整个包，决议 15-25/0681r1 允许它在应答紧凑帧里带上 5 个八位组的预测回复时间（Predicted Reply Time），从而省去单独的回复时间报告；2025 年提案中的固定回复时间与反序被这份决议取代。本仿真器照此实现两种形态与预测回复时间：标签（tag）与三个锚点（anchor）测距时，两种形态的片段间隔都是 1 ms，交织的一轮 66 个时隙、非交织 86 个；打开预测回复时间后，每轮少发 3 个报告，标签在 18.500 ms 就得到第一个距离，而不是 42.118 ms。',
  outcomes: [
    '说出草案对两种形态的规定：交织时谁先发、偏移多少，非交织时几个子轮、应答方何时开始自己的子轮',
    '说出决议 15-25/0681r1 怎样省去回复时间的报告，以及它取代了哪两份提案',
    '读出两种形态下一列片段的间隔与一轮的时隙数，并分清哪些是本仿真器的排法',
  ],
  needs: ['uwb-uwbd', 'uwb-slot-budget'],
  terms: [
    { term: 'non-interleaved sub-round', plain: '非交织子轮：草案 §10.39.7 的形态，一个子轮里只有一方发送，它把整列片段连续发完，再轮到下一方' },
    { term: 'Predicted Reply Time', plain: '预测回复时间：决议 15-25/0681r1 加入 Response Compact 帧的 5 个八位组字段，应答方报告自己将要发送的片段与收到的片段之间 RMARKER 的时间差，只用于非交织形态' },
    { term: 'macMmsFixedReplyTime', plain: '固定回复时间：2025 年提案中的属性，应答方按事先约定的固定间隔发送自己的 MMS 包；没有被采纳，由预测回复时间取代' },
    { term: 'Reversed MMS order', plain: '反序：2025 年提案中的选项，应答方先发送自己的 MMS 包；没有出现在通过的决议里' },
  ],
  standard: [
    { heading: '交织形态（15-24/0633r1、15-24/0664r2）', text: '草案 D01 规定 MMS 包的片段交织发送：发起方发出一个片段后，应答方在其后 500 µs 发出一个片段，如此交替，直到所有片段发完；同一方相邻两个片段相隔 1 ms。一对多测距时，测距阶段按应答方分成子轮，每个子轮有自己的一对多轮询紧凑帧：第一个子轮的轮询帧 Message Control 为 1，列出全部应答方，以后各子轮的为 0（15-25/0213r2，CID 474）。' },
    { heading: '非交织形态（P802.15.4ab 草案 §10.39.7）', text: '草案写明：一个非交织测距轮（ranging round）可以由一个、两个、三个或四个子轮组成。所用的模式由描述媒体访问控制（medium access control, MAC）配置的 Management MAC Configuration 字段里的 Non-Interleaved Mode 参数指明（草案 §10.39.11.1.3.9）。以下按 TG4ab 文稿 15-25/0292r1 给出的、针对 §10.39.7 意见的修改文字。截至 2026 年 9 月，这部分仍有争议：一项涉及一对多非交织双边测距的意见决议动议以 12/13/1 未获通过（纪要 15-26/0425r0），反对理由是移动场景下的时长与应答方多时的帧长。' },
    { heading: '非交织的单边双向测距：两个子轮（15-25/0292r1）', text: '窄带（narrowband, NB）辅助配置下，发起方发出轮询紧凑帧（poll Compact frame），不等应答方的应答紧凑帧，在轮询紧凑帧开始之后 macMmsRcpPollNSlots 个时隙发送自己的 MMS 测距包；这是第一个子轮，长 macMmsRcpPollNSlots + macMmsRpDuration 个时隙。应答方在收到这个 MMS 包开头之后 macMmsRpDuration 个时隙，以一个应答紧凑帧开始第二个子轮，并在第二个子轮开始之后 macMmsRcpRespNSlots 个时隙发送自己的 MMS 包。是否发送报告是可选的。UWB 驱动配置的非交织形态与此相同，只是控制阶段使用超宽带。' },
    { heading: '一对多（15-25/0292r1）', text: '非交织模式与一对多测距并不互斥，基本的一对多测距也可以按非交织方式进行；文稿的说明是，每个一对多子轮可以看作一个完整的一对一测距轮。非交织模式不适用于基于竞争的一对多测距、时间高效的一对多测距与每个时隙多个测距序列片段（ranging sequence fragment, RSF）的一对多测距。一对多非交织形态的细节，评审意见的处置写的是「需要进一步工作」（15-25/0213r2，CID 205、207）。' },
    { heading: '回复时间：预测回复时间（决议 15-25/0681r1，已通过）', text: '决议在 One-to-one Response Compact 帧（草案 §10.39.11.3.6）与 One-to-many Response Compact 帧（草案 §10.39.11.3.10）里增加 Message Control 字段的取值 2：此时 Message Content 是 5 个八位组的 Predicted Reply Time，即在应答方测得的、收到的发起方 MMS 片段与它将在这个应答帧之后发送的 MMS 片段之间 RMARKER（ranging marker）的时间差，单位见 §10.29.1.4。这种格式只用于非交织形态，用来省去单独的回复时间报告。纪要 15-26/0006r0 记录这份决议无异议通过。' },
    { heading: '被取代的提案', text: 'IEEE Std 802.15.4-2024 §10.29.6.5 有固定回复时间的 SS-TWR。2025 年的提案 15-25/0224r2 与 15-25/0556r2 建议把它扩展到 MMS：属性 macMmsFixedReplyTime，以及让应答方先发送的 Reversed MMS order。决议 15-25/0681r1 答复的正是这几条意见，它写明交织形态下的固定回复时间增加实现复杂度而收益很小，不需要增加这个参数，非交织形态改用预测回复时间。反序没有出现在决议里。' },
    { kind: 'steps', heading: '非交织的单边双向测距，按草案：逐步说明', items: [
      '发起方发出轮询紧凑帧（UWB 驱动配置下是控制阶段的 SP0 包），开始第一个子轮。',
      '发起方不等应答，在 macMmsRcpPollNSlots 个时隙之后把自己的 MMS 测距包连续发完，每毫秒一个片段。',
      '应答方收到这个 MMS 包，隔 macMmsRpDuration 个时隙，以应答紧凑帧开始第二个子轮；这个应答帧可以带预测回复时间（Message Control = 2）。',
      '应答方在第二个子轮开始之后 macMmsRcpRespNSlots 个时隙，把自己的 MMS 测距包连续发完。',
      '发起方测得往返时间，结合回复时间算出距离；回复时间已在应答紧凑帧里给出时，不需要单独的报告。',
    ] },
  ],
  implementation: [
    { topic: '交织形态', standard: '发起方的片段之后 500 µs 是应答方的片段，同一方相隔 1 ms；一对多时每个应答方一个子轮（15-24/0633r1、15-25/0213r2）', sim: '照此实现：600 RSTU（ranging scheduling time unit）的时隙上发起方每 2 个时隙一个片段、应答方晚 1 个时隙；三个应答方是三个这样的子轮，每个子轮 22 个时隙，一轮 66 个。', kind: 'faithful' },
    { topic: '非交织子轮', standard: '一个子轮只有一方发送，整列片段连续发完（草案 §10.39.7）', sim: '照此实现：子轮里只有一个发送者，相邻片段的间隔只由时隙长度决定，600 RSTU 的时隙上是 2 个时隙、1 ms。', kind: 'faithful' },
    { topic: '一对多非交织的排法', standard: '可以按非交织方式进行；细节尚待进一步工作（15-25/0213r2）', sim: '发起方占第一个子轮，它的一列片段同时供三个应答方接收；三个应答方各占一个子轮，每个子轮 20 个时隙，四个子轮之后是 6 个时隙的报告阶段，一轮共 86 个时隙。', kind: 'choice' },
    { topic: '控制阶段', standard: '每个子轮以轮询或应答紧凑帧开始', sim: '本课的基准场景用 UWB 驱动配置的零长控制阶段（提案 15-25/0194r0），不发紧凑帧；后两个场景用 SP0 控制相位，应答方在自己子轮开头发 SP0 应答帧。', kind: 'choice' },
    { topic: '预测回复时间', standard: 'Response Compact 帧里 5 个八位组的 Predicted Reply Time，只用于非交织形态（决议 15-25/0681r1）', sim: '照此实现：应答方用自己的计数器算出「收到的发起方 RMARKER」到「自己第一个片段的发送时刻」之差，放进 SP0 应答帧；它不再发回复时间报告，发起方收到它的一列片段后就算出距离。', kind: 'faithful' },
    { topic: '报告阶段', standard: '报告可选；有预测回复时间时可省去回复时间报告', sim: '保留报告阶段：每个应答方两个窗口。打开预测回复时间后，应答方自己的窗口空着，发起方仍在另一个窗口里把往返时间发给它，让应答方也得到距离。', kind: 'choice' },
    { topic: '固定回复时间与反序', standard: '提案 15-25/0224r2、15-25/0556r2，被决议 15-25/0681r1 取代', sim: '未实现：它们不在草案里。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '两种形态，同一个房间',
      more: [0],
      steps: [
        '载入本课场景，读出 0.000 ms 那一行一轮的时隙数；再载入「交织，一对多」读同一行。',
        '对照下图与下表，比较两种形态下一列片段的间隔、跨度与一轮的长度。',
      ],
      blocks: [
        { kind: 'diagram', heading: '两种形态，按同一时间刻度绘制', spec: uwbSubroundsTiming(), caption: '上两行是交织形态（图中标为“穿插”），下两行是非交织形态（标为“轮流”）；每一对中上面一行是标签的片段，下面一行是三个锚点的二十四个片段。交织时标签在每个锚点的子轮里各发一次自己的一列。' },
        { kind: 'table', heading: '同一个房间，两种形态', head: ['量', '交织，一对多', '非交织，一对多'], rows: [
          ['子轮数', '3', '4'],
          ['测距阶段', '每子轮 20 时隙', '每子轮 20 时隙'],
          ['一轮', '66 时隙 · 33 ms', '86 时隙 · 43 ms'],
          ['相邻片段的间隔', '2 时隙 · 1 ms', '2 时隙 · 1 ms'],
          ['一列八个片段的跨度', '7 ms', '7 ms'],
          ['标签发出的片段', '24', '8'],
          ['每个 200 ms 测距块（ranging block）的距离数', '6', '6'],
        ] },
      ],
      expect: '0.000 ms 那一行写着 “tag-1 UWB round 0 of block 0 (MMS): 86 slots × 500.0 µs”，交织场景是 66 slots。两种形态下标签相邻片段都相隔 1 ms；交织时标签为三个锚点各发一列，非交织时只发一列、三个锚点同时接收。两种形态每块都得到 6 个距离。',
      meaning: '交织时的 500 µs 偏移与每个应答方一个子轮是草案的规定（①），所以间隔与锚点数无关；非交织的一对多排法是本仿真器的取法（②）。',
    },
    {
      heading: '子轮的边界',
      jump: 1,
      steps: [
        '跳到第一个锚点开始发送自己一列片段的时刻。',
        '读出标签一列片段的起止、三个锚点与标签各自的判定时刻，以及距离出现的时刻。',
      ],
      expect: '标签的八个片段在 0 到 7 ms 之间发完，第一个锚点在 10.000 ms 开始发送。三个锚点的判定都在 7.500 ms：它们收到的是标签的同一次发送；标签的三条判定在 17.500、27.500、37.500 ms。六个距离出现在 40.118 到 42.618 ms 之间，标签测得的三个距离是 3.01、6.01 与 8.91 m，真值 3、6、9 m。',
      meaning: '发起方先把自己的一列发完、应答方再依次发送，与草案的子轮次序一致（①）；距离出现在报告阶段，因为这个场景没有应答紧凑帧，回复时间只能放在报告里（②）。',
    },
    {
      heading: '应答帧带上预测回复时间',
      variant: 2,
      more: [1],
      steps: [
        '载入「带 SP0 控制相位」，数一轮里的 SP0 包，读出标签得到三个距离的时刻。',
        '再载入「应答帧带预测回复时间」，读同样的两项，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '预测回复时间：关闭与打开', head: ['量', '关闭', '打开'], rows: [
          ['一轮中的 SP0 包', '10 个', '7 个'],
          ['应答方的回复时间报告', '3 个', '0 个'],
          ['标签得出第一个距离', '42.118 ms', '18.500 ms'],
          ['标签测得的三个距离，真值 3、6、9 m', '3.01、6.00、8.89 m', '3.01、6.00、8.89 m'],
        ] },
      ],
      expect: '打开之后三个锚点不再发报告，标签在 18.500、29.000、39.500 ms 各得到一个距离，正是它判定每个锚点那一列片段的时刻；距离与关闭时完全相同。三个锚点仍在 42.618 到 44.618 ms 之间得到距离，因为标签照常把往返时间发给它们。',
      meaning: '预测回复时间就是应答方本来要报告的那个回复时间，只是提前放进了应答帧（①），所以距离不变、报告省掉（②）。',
    },
  ],
  sources: [
    'P802.15.4ab 草案 §10.39.7（正在审议，仅对会员开放）：非交织形态由一至四个子轮组成，按 TG4ab 文稿 15-25/0292r1 的引述与修改文字；Non-Interleaved Mode 参数（草案 §10.39.11.1.3.9）。2026 年 9 月的动议以 12/13/1 未获通过，见纪要 15-26/0425r0。交织形态的 500 µs 偏移：15-24/0633r1、15-24/0664r2；一对多的子轮与轮询帧：15-25/0213r2（CID 474、205、207）。',
    '决议 15-25/0681r1（纪要 15-26/0006r0：无异议通过）：One-to-one 与 One-to-many Response Compact 帧（草案 §10.39.11.3.6、§10.39.11.3.10）里的 Predicted Reply Time，只用于非交织形态。',
    '被取代的提案：15-25/0224r2（固定回复时间）、15-25/0556r2（固定回复时间与反序）。IEEE Std 802.15.4-2024：§10.29.6.5（固定回复时间的 SS-TWR）、§10.29.1.4（时间单位）。',
    '本仿真器的取值与取法：一对多非交织时发起方一个子轮、每个应答方一个子轮、每个子轮 20 个时隙、报告阶段 6 个时隙；零长控制阶段与 SP0 控制相位的场景；有预测回复时间时发起方仍发往返时间报告。',
  ],
  limits: [],
  scenario: () => uwbSubroundsScenario('base'),
  variants: [
    { label: '交织，一对多', scenario: () => uwbSubroundsScenario('interleaved') },
    { label: '带 SP0 控制相位', scenario: () => uwbSubroundsScenario('sp0') },
    { label: '应答帧带预测回复时间', scenario: () => uwbSubroundsScenario('predicted') },
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
      q: '三个锚点的一对多测距，交织与非交织两种形态下同一列片段的相邻间隔各是多少？',
      options: [
        '交织 2 ms，非交织 1 ms',
        '都是 1 ms：交织时每个应答方一个子轮、应答方晚 500 µs，非交织时一个子轮只有一个发送者',
        '都由应答方数决定',
      ],
      answer: 1,
      explain: '草案的交织形态是发起方之后 500 µs 应答方、同一方相隔 1 ms，一对多时每个应答方各一个子轮；非交织时间隔只由时隙长度决定，是 ⌈1 200 RSTU / 时隙⌉ × 时隙。',
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
