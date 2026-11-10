/**
 * UWB Tier 1 · M14 两个时钟 · Deferred DS-TWR: the initiator's two times arrive a frame later.
 *
 * Standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① IEEE Std 802.15.4-2024's two DS-TWR procedures for the initiator's two times — §10.29.6.6
 * deferred (a later message carries them in an RMI IE, the responder computes) and §10.29.6.7
 * embedded (RMI + RRTI in the final frame) — and the one-to-many deferred round of §10.32.5
 * Figure 10-237 (ARC IE Deferred Mode = 1, a bare Final, a deferred Data frame); ② what this
 * simulator does with each; ③ three runs.
 *
 * (Until W2 of the alignment, audit #3, this lesson taught that in the deferred shape the anchor
 * never gets the initiator's times — this simulator's own arrangement, not the standard's.)
 *
 * It loads `uwb-reply-time`'s own bench, built by the same function with `method: 'ds'`: one
 * anchor and one tag 5.00 m apart, crystals 35 ppm apart, both noise sources off. The base
 * scenario is the DEFERRED shape; the single variant is the embedded Final.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-deferred-ds.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import { J, firstUwbFinal, firstUwbPoll, type Lesson } from '../lessonKit'
import {
  RMI_FIXED_BYTES, RMI_TIME_BYTES, RRTI_CONTENT_HDR_BYTES, RRTI_REPLY_BYTES, UWB_FCS_BYTES,
  UWB_IE_HDR_BYTES, UWB_MHR_BYTES, UWB_MAX_PSDU_BYTES, UWB_REPORT_BYTES, UWB_SHORT_ADDR_BYTES,
  uwbDsDeferredReportBytes, uwbFinalBytes, uwbPollBytes, uwbRespBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../uwb/phy'
import { BENCH_M, CAP, RANGE_M, uwbReplyTimeScenario } from './uwb-reply-time'

/** The bench of `uwb-reply-time`, measured the other way: the same two devices, DS-TWR. */
export function uwbDeferredDsScenario(replyTime: 'embedded' | 'deferred'): Scenario {
  return uwbReplyTimeScenario(replyTime, 'ds')
}

/** The anchor count the figure and the octet table are drawn at: the embedded Final's own cap. */
export const FIG_ANCHORS = CAP.dsEmbedded

/** The RRTI IE's fixed part: element header + its 1-octet content header (§10.29.8.1). */
export const RRTI_FIXED_BYTES = UWB_IE_HDR_BYTES + RRTI_CONTENT_HDR_BYTES

/** Slots of a DS round at `anchors` anchors, per reply-time shape. */
export const dsSlots = (anchors: number, replyTime: 'embedded' | 'deferred'): number =>
  uwbSlotsPerTag('ds', anchors, 'time', 8, 'twr', undefined, undefined, replyTime)

/** Octets of the round's frames, from the PHY — never typed as literals. */
export const BYTES = {
  pollOne: uwbPollBytes(1),
  respOne: uwbRespBytes('ds'),
  report: UWB_REPORT_BYTES,
  finalEmbeddedOne: uwbFinalBytes(1, 'embedded'),
  finalDeferredOne: uwbFinalBytes(1, 'deferred'),
  deferredReportOne: uwbDsDeferredReportBytes(1),
  finalEmbeddedMany: uwbFinalBytes(FIG_ANCHORS, 'embedded'),
  finalDeferredMany: uwbFinalBytes(FIG_ANCHORS, 'deferred'),
  deferredReportMany: uwbDsDeferredReportBytes(FIG_ANCHORS),
  pollMany: uwbPollBytes(FIG_ANCHORS),
  psdu: UWB_MAX_PSDU_BYTES,
} as const

/** What one anchor adds to each frame. */
export const GROWTH = {
  finalEmbedded: uwbFinalBytes(2, 'embedded') - uwbFinalBytes(1, 'embedded'),
  deferredReport: uwbDsDeferredReportBytes(2) - uwbDsDeferredReportBytes(1),
  poll: uwbPollBytes(2) - uwbPollBytes(1),
} as const

/** What the deferred Final drops: both IEs, everything but the MHR and the FCS. */
export const DROPPED_BYTES = BYTES.finalEmbeddedMany - BYTES.finalDeferredMany

/** Slot demand at {@link FIG_ANCHORS} anchors, per shape, in nanoseconds. */
export const DEMAND = {
  dsEmbedded: uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded'),
  dsDeferred: uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'deferred'),
} as const

/**
 * The instants the two rounds put on the air, in milliseconds, exactly as the
 * timeline records them. Read back out of the run in the test, so the prose
 * cannot drift from it.
 */
export const FIG = {
  slotUs: 2000,
  /** Embedded: the anchor finishes when the Final lands. */
  anchorRangeUs: '4.199',
  /** Embedded: the tag finishes when the anchor's report lands. */
  tagRangeUs: '6.192',
  /** Deferred: the anchor finishes when the initiator's deferred report lands, a slot later. */
  anchorDeferredUs: '6.194',
  /** Deferred: the tag finishes when the anchor's report lands, a slot later again. */
  tagDeferredUs: '8.192',
} as const

/**
 * The embedded Final at nine anchors, field by field, drawn to scale. The deferred
 * Final keeps the first box and the last; the six boxes between them — the two IEs —
 * are what moves to the initiator's deferred report.
 */
export function uwbDeferredDsFields(): FieldsSpec {
  const fields = [
    { label: `MHR ${UWB_MHR_BYTES}`, size: UWB_MHR_BYTES },
    { label: `RMI 表头 ${RMI_FIXED_BYTES}`, size: RMI_FIXED_BYTES },
    { label: `往返时间 ×${FIG_ANCHORS}`, size: RMI_TIME_BYTES * FIG_ANCHORS },
    { label: `短地址 ×${FIG_ANCHORS}`, size: UWB_SHORT_ADDR_BYTES * FIG_ANCHORS },
    { label: `RRTI 表头 ${RRTI_FIXED_BYTES}`, size: RRTI_FIXED_BYTES },
    { label: `回复时延 ×${FIG_ANCHORS}`, size: RRTI_REPLY_BYTES * FIG_ANCHORS },
    { label: `短地址 ×${FIG_ANCHORS}`, size: UWB_SHORT_ADDR_BYTES * FIG_ANCHORS },
    { label: `FCS ${UWB_FCS_BYTES}`, size: UWB_FCS_BYTES },
  ]
  const total = fields.reduce((n, f) => n + f.size, 0)
  return {
    kind: 'fields',
    fields,
    unit: 'B',
    total: `嵌入 ${total} 字节，延后 ${BYTES.finalDeferredMany} 字节，差 ${DROPPED_BYTES} 在中间六格`,
  }
}

export const uwbDeferredDs: Lesson = {
  id: 'uwb-deferred-ds',
  module: 15,
  title: '延后形态：发起方的两个时间晚一帧送到锚点',
  why: '双边双向测距（double-sided two-way ranging, DS-TWR）里，响应方要算出距离，还缺发起方测得的两段时间：第一次往返的往返时间与第二次往返的回复时延（reply time）。IEEE 802.15.4-2024 为此规定了两种过程。嵌入（§10.29.6.7）：发起方在结束消息（Final）里用测距测量信息（ranging measurement information, RMI）信息单元带往返时间、用 RRTI 信息单元带回复时延，这要求发起方在发出 Final 之前就能确定 Final 的发送时刻。延后（§10.29.6.6）：由发起方之后的一条消息用 RMI 信息单元把两段时间发给响应方，响应方随后算出距离。一对多时（§10.32.5，图 10-237），ARC 信息单元的 Deferred Mode 字段为 1，表示测距交互之后另排时隙给延后数据帧（data frame）；Final 只是一帧测距帧，不带测量信息，发起方在延后数据帧里为每个响应方列出这两段时间。两种过程里响应方都得到距离；延后形态多一帧、多一个时隙，响应方晚一个时隙算出距离。本仿真器按这一流程实现：延后的 Final 只剩帧头（MAC header）与帧校验序列（frame check sequence, FCS），共 11 字节；延后数据帧每增加一个锚点（anchor）增长 10 字节，按本仿真器的地址取法，它成为轮中最长的一帧，锚点上限从嵌入形态的 9 个变为 11 个。',
  outcomes: [
    '说出标准的嵌入与延后两种双边过程里，发起方的两段时间分别由哪一帧送到响应方',
    '算出两种形态里 Final 与延后数据帧的长度，以及它们各自决定的锚点上限',
    '说出两种形态里各由哪一端、在哪一帧到达时算出距离',
  ],
  needs: ['uwb-dstwr', 'uwb-reply-time'],
  terms: [
    { term: 'RMI', plain: 'Ranging Measurement Information IE：把回复时延、往返时间、飞行时间等测量发给一个或多个设备的信息单元，其中至少要有一项测量（§10.29.8.4）' },
    { term: 'Deferred Mode', plain: 'ARC 信息单元与 RMI 信息单元中的一个字段：在 ARC 里为 1 表示测距交互之后另排时隙发送延后数据帧；在 RMI 里为 1 表示这个信息单元是在之后的测量报告阶段发送的（§10.32.9.1，§10.29.8.4）' },
    { term: 'deferred data frame', plain: '延后数据帧：测量报告阶段里发起方发出的数据帧，带 Deferred Mode 为 1 的 RMI 信息单元（§10.32.5 图 10-237）' },
    { term: 'PSDU', plain: '一帧中实际承载消息的部分；BPRF 模式下物理头的 7 位长度字段使它最长 127 字节（§16.2.7）' },
  ],
  standard: [
    { heading: '一对一，延后（§10.29.6.6，图 10-206）', text: '发起方发出带 RRMC 信息单元的测距数据帧，它与它的确认帧（acknowledgement, ACK）构成第一次往返；响应方再发出一帧数据帧，RRMC 信息单元里 Reply Time Request 与 Round-trip Time Request 都为 1，它与它的确认帧构成第二次往返。之后发起方用一条消息，以测距测量信息（ranging measurement information, RMI）信息单元送出第一次往返时间与第二次往返的回复时延。响应方收到后即可按 §10.29.1.2.3 的公式算出飞行时间；是否再把结果报告给发起方，取决于发起方 RRMC 信息单元里的 TOF Request 字段。' },
    { heading: '一对一，嵌入（§10.29.6.7，图 10-207）', text: '三条消息的双边交互要求发起方能够在完成第二次往返的那一帧里嵌入回复时延：发起方最后发出的测距帧用 RMI 信息单元带第一次往返时间，用 RRTI 信息单元带这次往返的回复时延（MCPS-DATA.request 的 RequestRrtiTx 参数让 MAC 插入 RRTI）。响应方收到后算出飞行时间。' },
    { heading: '一对多，延后（§10.32.5，图 10-237；§10.32.9.1）', text: 'ARC 信息单元的 Deferred Mode 字段为 1 时，测距交互之后另排时隙发送延后数据帧，用来报告回复时延、往返时间等测量。此时 Final 只是一帧测距帧，图中写作 {Ranging}，不带测量信息单元；发起方在延后数据帧里用 RMI 信息单元把第一次往返时间与第二次回复时延发给各响应方，这个 RMI 信息单元的 Deferred Mode 字段为 1。' },
    { heading: 'RMI 信息单元的规则（§10.29.8.4，图 10-212、10-213）', text: '内容首部 2 字节，含各项测量是否存在的标志、地址长度、Deferred Mode 与 7 位的列表长度；列表的每一项里，回复时延、往返时间各 4 字节。至少要有一项测量。单播帧里只有一个不带地址的列表项；广播帧里每个列表项都必须带地址，地址是 2 字节的短地址或 8 字节的扩展地址。RRTI 信息单元的内容首部 1 字节，每个回复时延 4 字节，地址规则见 §10.29.8.1。' },
    { heading: '一帧最长多少（§16.2.7）', text: 'BPRF 模式下，物理头（PHY header, PHR）的帧长字段给出 PSDU（PHY service data unit）的字节数，能表示的最大值是 127 字节；HPRF 模式的物理头能表示更长的帧，本课不涉及。' },
    { kind: 'steps', heading: '一对多延后形态的一轮，按标准：逐步说明（§10.32.5，图 10-237）', items: [
      '发起方广播启动消息，带 RRMC 信息单元（控制值 2）；控制消息的 ARC 信息单元 Deferred Mode 为 1。',
      '各响应方依次应答，带 RRMC 信息单元（控制值 3），请求回复时延与往返时间；每个响应方得到自己的 Treply1。',
      '发起方广播 Final，不带测量信息单元。各响应方为它的到达打时间戳，得到 Tround2；发起方读回 Final 的实际发送时刻，得到对每个响应方的 Treply2。',
      '测量报告阶段：发起方广播延后数据帧，一个 RMI 信息单元为每个响应方列出 Tround1 与 Treply2，每项带地址。',
      '每个响应方集齐四段时间，算出飞行时间。',
    ] },
  ],
  implementation: [
    { topic: '延后的 Final', standard: '只是一帧测距帧，不带测量信息单元（§10.32.5 图 10-237）', sim: `照此：帧头 ${UWB_MHR_BYTES} 字节加帧校验 ${UWB_FCS_BYTES} 字节，共 ${BYTES.finalDeferredOne} 字节，不随锚点数增长。`, kind: 'faithful' },
    { topic: '延后数据帧', standard: '发起方用 RMI（Deferred Mode 为 1）为各响应方列出两段时间（§10.32.5，§10.29.8.4）', sim: `照此：一个广播的 RMI 信息单元，每个锚点一项，含往返时间、回复时延与 2 字节的短地址，共 ${uwbDsDeferredReportBytes(0)} + ${GROWTH.deferredReport}A 字节；没有收到 Response 的锚点不在表中。`, kind: 'faithful' },
    { topic: 'Deferred Mode 字段', standard: 'ARC 信息单元的 Deferred Mode 为 1 时另排时隙（§10.32.9.1）', sim: '两种形态的 Poll 里 ARC 的 Deferred Mode 都为 1：延后形态为发起方的延后数据帧排了时隙，嵌入形态也为锚点的报告排了时隙。', kind: 'faithful' },
    { topic: '延后数据帧的时隙', standard: '只要求另排时隙，不规定放在哪里', sim: '紧接在 Final 之后的一个时隙，所以 A 个锚点的一轮占 2A + 3 个时隙，嵌入形态是 2A + 2 个。', kind: 'choice' },
    { topic: '哪一端计算', standard: '响应方收到延后数据帧后计算（§10.29.6.6，§10.32.5）', sim: '照此：锚点在延后数据帧到达时算出距离。', kind: 'faithful' },
    { topic: '发起方也得到距离', standard: '图 10-237 画的是发起方不请求结果的情形；请求时响应方在测量报告阶段发回测量（图 10-238）', sim: `本课的场景请求了：锚点随后发 ${BYTES.report} 字节的报告，一个 RMI 信息单元带回自己的回复时延与往返时间，手机据此也算出距离。图 10-238 里第一段回复时延由应答中的 RRTI 带回，本仿真器的 Response 不带 RRTI。`, kind: 'differs' },
    { topic: '地址', standard: '短地址或扩展地址；RRTI 在约定次序时可省地址（§10.29.8.1，§10.29.8.4）', sim: `一律用 ${UWB_SHORT_ADDR_BYTES} 字节的短地址，嵌入式 Final 的 RRTI 列表项也带地址。换成扩展地址或省去 RRTI 的地址，${CAP.dsEmbedded} 与 ${CAP.dsDeferred} 这两个上限都要重算。`, kind: 'value' },
    { topic: '形态的选定', standard: '会话参数由上层或控制消息设定；RRTN 信息单元可用于协商回复时延（§10.29.8.6）', sim: '形态是场景事先给定的配置，整场不变；没有任何空口消息启停或重配会话，RRTN 信息单元未实现。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一帧 11 字节的 Final',
      jump: 1,
      steps: [
        '载入本课场景（延后形态），跳到 Final，看它的长度与信息单元。',
        '看下一个时隙里手机发出的那一帧，再找锚点那条泳道的测距行出现的时刻。',
      ],
      expect: `Final 在 4 ms 处发出，只有 ${BYTES.finalDeferredOne} 字节，不带任何信息单元；下一个时隙里手机发出 ${BYTES.deferredReportOne} 字节的延后数据帧，带一个 RMI 信息单元。整轮写着 ${dsSlots(1, 'deferred')} slots。锚点的测距行在 ${FIG.anchorDeferredUs} ms，即延后数据帧到达之后；手机的在 ${FIG.tagDeferredUs} ms，即锚点的报告到达之后。两者都是 ${RANGE_M.ds} m，真值 ${BENCH_M.toFixed(2)} m。`,
      meaning: '这正是 ① 的一对多延后过程：Final 只完成第二次往返，两段时间由延后数据帧送到锚点。手机也得到距离，是因为本课的场景请求了报告（②）。',
    },
    {
      heading: '嵌入形态：Final 把两段时间带给锚点',
      variant: 0,
      steps: [
        '载入「嵌入」，跳到 Final，看它的长度与信息单元。',
        '读出锚点与手机两条测距行的时刻与数值，与延后形态对照。',
      ],
      blocks: [
        { kind: 'table', heading: '本课的场景里哪一端在何时算出距离', head: ['形态', '手机', '锚点'], rows: [
          ['DS-TWR 嵌入', '✓ 收到报告时', '✓ 收到 Final 时'],
          ['DS-TWR 延后', '✓ 收到报告时', '✓ 收到延后数据帧时'],
        ] },
      ],
      expect: `Final 是 ${BYTES.finalEmbeddedOne} 字节，带 RMI 与 RRTI 两个信息单元，比延后形态多 ${BYTES.finalEmbeddedOne - BYTES.finalDeferredOne} 字节；整轮 ${dsSlots(1, 'embedded')} slots。锚点在 ${FIG.anchorRangeUs} ms 算出 ${RANGE_M.ds} m，手机在 ${FIG.tagRangeUs} ms 算出同一个数。延后形态把两行分别推迟到 ${FIG.anchorDeferredUs} ms 与 ${FIG.tagDeferredUs} ms，数值不变。`,
      meaning: '两种形态的四段时间相同，只是发起方的两段时间晚一帧送到（①）；多出的一个时隙是本仿真器把延后数据帧排在 Final 之后的结果（②）。',
    },
    {
      heading: '锚点上限：轮中最长的一帧',
      more: [0],
      steps: [
        `在编辑器里把锚点加到十个，仍用嵌入形态：场景被拒绝，因为 Final 需要 ${uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')} 字节，超过 ${BYTES.psdu} 字节。`,
        `把形态改为延后，同样十个锚点可以通过校验；${CAP.dsDeferred} 个以内都能通过，再多则是延后数据帧超出上限。`,
      ],
      blocks: [
        {
          kind: 'diagram', heading: `${FIG_ANCHORS} 个锚点的 Final，逐个字段查看`, spec: uwbDeferredDsFields(),
          caption: `按字节数绘制的嵌入式 Final（字段宽度见 §10.29.8.4 图 10-212、10-213 与 §10.29.8.1 图 10-208、10-209；地址取法见 ②）。延后形态的 Final 只保留首尾两格；去掉的 ${DROPPED_BYTES} 个字节是 RMI 与 RRTI 两个信息单元，它们的内容改由延后数据帧携带，${FIG_ANCHORS} 个锚点时共 ${BYTES.deferredReportMany} 字节。`,
        },
        { kind: 'table', heading: '两种形态，两个上限', head: ['这一帧', '嵌入', '延后'], rows: [
          ['Final 长度', `${uwbFinalBytes(0, 'embedded')} + ${GROWTH.finalEmbedded}A`, `${uwbFinalBytes(0, 'deferred')}（不随 A 增长）`],
          ['延后数据帧', '无', `${uwbDsDeferredReportBytes(0)} + ${GROWTH.deferredReport}A`],
          [`A = ${FIG_ANCHORS}`, `Final ${BYTES.finalEmbeddedMany} B`, `Final ${BYTES.finalDeferredMany} B，延后数据帧 ${BYTES.deferredReportMany} B`],
          ['轮中最长的一帧', 'Final', '延后数据帧'],
          ['锚点上限', String(CAP.dsEmbedded), String(CAP.dsDeferred)],
          [`A = ${FIG_ANCHORS} 时的最短时隙`, `${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs`, `${(DEMAND.dsDeferred / 1000).toFixed(1)} µs`],
        ] },
      ],
      expect: `嵌入式 Final 每个锚点增长 ${GROWTH.finalEmbedded} 字节，${CAP.dsEmbedded} 个锚点时 ${BYTES.finalEmbeddedMany} 字节，再加一个就超出 ${BYTES.psdu} 字节；延后数据帧每个锚点只增长 ${GROWTH.deferredReport} 字节，比 Poll 每个锚点 ${GROWTH.poll} 字节增长得快，所以它是延后形态里最长的一帧，上限为 ${CAP.dsDeferred}。`,
      meaning: `127 字节来自标准（①）；每个锚点增长多少字节，取决于本仿真器的短地址与 RRTI 带地址这两项取法（②），所以 ${CAP.dsEmbedded} 与 ${CAP.dsDeferred} 是本仿真器的上限，不是标准规定的数。`,
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.6.6 与图 10-206（一对一延后双边过程）、§10.29.6.7 与图 10-207（一对一嵌入双边过程）、§10.32.5 与图 10-236、10-237、10-238（一对多双边过程，延后形态，测量报告）、§10.32.9.1（ARC 信息单元的 Deferred Mode 字段）、§10.29.8.4（RMI 信息单元）、§10.29.8.1（RRTI 信息单元）、§10.29.8.6（RRTN 信息单元）、§16.2.7（物理头的帧长字段）。这一课不依赖任何草案。',
    '本仿真器的取值与取法：2 ms 的测距时隙（通常认为来自 FiRa 的缺省配置，FiRa 规范不在核查用的语料里）、时隙末尾 200 ns 的守卫、16 位短地址的帧头（9 字节）、RRTI 列表项也带地址、延后数据帧排在 Final 之后的下一个时隙、锚点的报告带回两段时间。锚点上限与最短时隙都由这些取值算出。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都设为零，两端之间也没有墙，所以两种形态的读数可以逐位比较。',
  ],
  limits: [],
  scenario: () => uwbDeferredDsScenario('deferred'),
  variants: [
    { label: '嵌入：Final 把两个时间带给锚点', scenario: () => uwbDeferredDsScenario('embedded') },
  ],
  jumps: [
    J('Poll 从手机发出', firstUwbPoll),
    J(`Final：只剩 ${BYTES.finalDeferredOne} 字节`, firstUwbFinal),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一对多延后形态的 Final 不带任何测量信息单元。按标准，锚点怎样得到发起方测得的两段时间？',
      options: [
        '锚点从自己的时间戳推算出来',
        '发起方在测量报告阶段发出一帧延后数据帧，用 RMI 信息单元为每个锚点列出这两段时间',
        '锚点得不到，只有发起方能算出距离',
      ],
      answer: 1,
      explain: '§10.29.6.6 与 §10.32.5 图 10-237：发起方随后用延后数据帧（RMI 信息单元，Deferred Mode 为 1）把往返时间与回复时延发给各响应方，响应方据此算出距离。',
    },
    {
      q: `为什么本仿真器里嵌入形态的锚点上限是 ${CAP.dsEmbedded}，延后却是 ${CAP.dsDeferred}？`,
      options: [
        '延后的一轮时隙更少，所以一个块中能容纳更多锚点',
        `上限由轮中最长的那一帧决定：嵌入式 Final 每个锚点增长 ${GROWTH.finalEmbedded} 字节，延后数据帧每个锚点只增长 ${GROWTH.deferredReport} 字节`,
        '延后形态放宽了对 PSDU 长度的要求',
      ],
      answer: 1,
      explain: `上限是使最长的一帧仍不超过 ${BYTES.psdu} 字节的最大锚点数。改变的不是规则，而是哪一帧最长、它增长得多快。`,
    },
    {
      q: '在本课的场景里，延后形态与嵌入形态相比，锚点得到的距离有什么不同？',
      options: [
        '延后形态的锚点得不到距离',
        '两种形态锚点得到同一个距离，延后形态晚一个时隙',
        '延后形态的距离误差更大',
      ],
      answer: 1,
      explain: '四段时间都一样，只是发起方的两段时间晚一帧送到：锚点在延后数据帧到达时算出距离，比嵌入形态晚一个时隙，数值相同。',
    },
  ],
}
