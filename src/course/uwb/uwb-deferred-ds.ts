/**
 * UWB Tier 1 · M14 两个时钟 · Deferred DS-TWR: the initiator's two times arrive a frame later.
 *
 * The second half of the reply-time pair. `uwb-reply-time` establishes the one
 * constraint — a frame cannot carry a number that measures its own transmit
 * instant — and walks the three SS-TWR shapes it creates. This lesson takes the
 * other half of the same question: whether DS-TWR's Final carries the two times
 * only the initiator can measure (§10.29.6.7, embedded) or leaves them for a
 * later frame (§10.29.6.6, deferred).
 *
 * Rewritten 2026-11-10 (W2 of the UWB standard alignment, audit #3): the engine's
 * deferred shape now follows §10.29.6.6 / §10.32.5 Figure 10-237 — a bare Final
 * with no IE, then the initiator's deferred Data frame carrying both times in one
 * RMI IE, after which each anchor computes its own range. Until then this lesson
 * taught the opposite («the anchor is only a transponder»), which was this
 * simulator's own arrangement and not the standard's.
 *
 * It loads `uwb-reply-time`'s own bench, built by the same function with
 * `method: 'ds'`: one anchor and one tag 5.00 m apart, crystals 35 ppm apart,
 * both noise sources off. The base scenario is the DEFERRED shape; the single
 * variant is the embedded Final.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-deferred-ds.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import {
  J, firstUwbFinal, firstUwbPoll, firstUwbRange, firstUwbReport, type Lesson,
} from '../lessonKit'
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
  why: '上一课讲完了单边双向测距（single-sided two-way ranging, SS-TWR）的三种方式。双边双向测距（double-sided two-way ranging, DS-TWR）面对同一个问题的另一半：标签（tag）自己测得的那两个时间——第一次往返的往返时间与第二次往返的回复时延（reply time）——怎样交给锚点（anchor）。嵌入形态把它们写入 Final（标准 §10.29.6.7、§10.32.5），锚点收到 Final 时即集齐四个时间并算出距离。可是 Final 自己的发射时刻正是第二段回复时延的终点，发起方必须事先确定这一时刻才能把它写进 Final。延后形态（§10.29.6.6；一对多时由 ARC IE 的 Deferred Mode 字段指示，§10.32.5 图 10-237）不要求这一点：Final 只是一帧不带任何测量信息元素的测距帧，发起方读回它的实际发射时刻之后，在测量报告阶段用一帧延后数据帧（data frame），以一个测距测量信息（ranging measurement information, RMI）信息元素把每个锚点的往返时间与回复时延发出；锚点收到这一帧，集齐四个时间，算出距离。本仿真器按这一流程实现。两种形态里两端最终都得到距离，差别在时间与长度：延后形态多一帧、多一个时隙，锚点晚一个时隙才算出距离；Final 本身缩到只剩帧头（MAC header）与帧校验，而那帧延后数据帧每增加一个锚点增长十个字节，于是按标准的字段宽度，它成为轮中最长的一帧，锚点上限从九个变为十一个。',
  outcomes: [
    '算出两种形态里 Final 与延后数据帧的长度，以及它们各自换来的锚点上限',
    '说明延后形态的 Final 为什么可以不带任何测量信息元素，那两个时间改由哪一帧送达',
    '说出五种测距形态中各由哪一端、在哪一帧到达时算出距离',
  ],
  needs: ['uwb-dstwr', 'uwb-reply-time'],
  terms: [
    { term: 'RMI', plain: 'Ranging Measurement Information IE：把回复时延、往返时间、飞行时间等测量发给一个或多个设备的信息元素（§10.29.8.4），其中至少要有一项测量；嵌入形态的 Final、延后数据帧与锚点的报告各带一份' },
    { term: 'Deferred Mode', plain: 'ARC IE 与 RMI IE 中的一个字段：置一时，测距交互之后另排时隙发送延后的数据帧，用来传递回复时延、往返时间等测量（§10.32.9.1、§10.29.8.4）' },
    { term: 'deferred data frame', plain: '延后数据帧：测量报告阶段里发起方发出的一帧数据帧，带 Deferred Mode 为一的 RMI IE（§10.32.5 图 10-237）' },
    { term: 'PSDU', plain: '一帧中实际承载消息的部分，BPRF 模式下最长 127 字节（HPRF 模式可以更长）' },
  ],
  picture: [
    { heading: 'Final 中那两个只有标签能测得的数', text: '双边测距的四个时间，两端各测两个。锚点测得的两个（它自己的等待时间、它自己的往返时间）由它自己持有；标签测得的两个却只有标签持有，而锚点必须得到它们——否则那个消去两端时钟误差的公式只有一半的输入；标准也说明，双边测距通常由响应方计算距离（§10.29.8.3）。嵌入形态中，往返时间按锚点逐个写入 Final 的测距测量信息（ranging measurement information, RMI）信息元素，回复时延写入同一帧的 RRTI 信息元素（§10.29.6.7），一帧发给所有锚点：锚点收到 Final 时即可算出距离。' },
    { kind: 'watch', jump: 1, heading: `一帧 ${BYTES.finalDeferredOne} 字节的 Final`, text: `载入仿真。跳到 Final：它只有 ${BYTES.finalDeferredOne} 字节，而嵌入形态同一个场景里的 Final 有 ${BYTES.finalEmbeddedOne} 字节。下一个时隙里，标签又发出一帧 ${BYTES.deferredReportOne} 字节的数据帧；锚点那条泳道的测距行就出现在这一帧到达之后。` },
    { heading: '延后的 Final 为什么可以不带任何测量信息元素', text: `在标准的一对多延后形态里（§10.32.5 图 10-237），Final 只是一帧测距帧，不带测量信息元素：它的任务只是完成第二次往返，让锚点为它的到达打时间戳。于是它只剩 ${UWB_MHR_BYTES} 字节的帧头与 ${UWB_FCS_BYTES} 字节的帧校验序列（frame check sequence, FCS），而且不随锚点数增长。那两个时间放进随后的延后数据帧：一个 RMI 信息元素，表头 ${RMI_FIXED_BYTES} 字节（含 2 字节的内容头），每个锚点一项，每项是 ${RMI_TIME_BYTES} 字节的往返时间、${RMI_TIME_BYTES} 字节的回复时延和 ${UWB_SHORT_ADDR_BYTES} 字节的短地址。这一项也告诉锚点：发起方收到了它的 Response。` },
    { heading: '锚点晚一个时隙算出距离', text: '锚点收到延后数据帧中属于自己的那一项，四个时间齐全，照常算出距离——与嵌入形态得到的是同一个数，只是晚了一个时隙。标签一侧也不受影响：锚点随后把自己测得的两个时间写入报告发回（这是发起方在 Poll 的 RRMC IE 里请求的，§10.29.8.3、§10.32.5），报告一到，标签同样算出距离。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: `${FIG_ANCHORS} 个锚点的 Final，逐个字段查看`, spec: uwbDeferredDsFields(),
      caption: `按标准的字段宽度（§10.29.8.4 图 10-212、10-213，§10.29.8.1 图 10-208、10-209）、按字节数绘制的嵌入式 Final。延后形态的 Final 只保留首尾两格：去掉的 ${DROPPED_BYTES} 个字节是 RMI 与 RRTI 两个信息元素。这两个信息元素里的时间并没有消失，而是改由延后数据帧携带：那一帧把每个锚点的两个时间放进同一个 RMI 列表项，${FIG_ANCHORS} 个锚点时共 ${BYTES.deferredReportMany} 字节。`,
    },
    { kind: 'table', heading: '两种形态，两个上限', head: [
      '这一帧', '嵌入', '延后',
    ], rows: [
      ['Final 长度', `${uwbFinalBytes(0, 'embedded')} + ${GROWTH.finalEmbedded}A`, `${uwbFinalBytes(0, 'deferred')}（不随 A 增长）`],
      ['延后数据帧', '无', `${uwbDsDeferredReportBytes(0)} + ${GROWTH.deferredReport}A`],
      [`A = 1（本课这一轮）`, `Final ${BYTES.finalEmbeddedOne} B`, `Final ${BYTES.finalDeferredOne} B，延后数据帧 ${BYTES.deferredReportOne} B`],
      [`A = ${FIG_ANCHORS}`, `Final ${BYTES.finalEmbeddedMany} B`, `Final ${BYTES.finalDeferredMany} B，延后数据帧 ${BYTES.deferredReportMany} B`],
      ['轮中最长的一帧', 'Final', '延后数据帧'],
      ['锚点上限', String(CAP.dsEmbedded), String(CAP.dsDeferred)],
      [`A = ${FIG_ANCHORS} 时的最短时隙`, `${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs`, `${(DEMAND.dsDeferred / 1000).toFixed(1)} µs`],
    ] },
    { heading: '上限是计算得出的，不是人为规定的', text: `一帧的 PSDU（PHY service data unit）最长 ${BYTES.psdu} 字节，这是 BPRF 模式的物理头（PHY header, PHR）中 7 位长度字段能表示的上限（§16.2.7；HPRF 模式的物理头能表示更长的帧，本课不涉及）。锚点上限就是「轮中最长的那一帧仍能容纳」的最大锚点数：嵌入式 Final 每增加一个锚点增长 ${GROWTH.finalEmbedded} 字节（两个信息元素里各一项，每项 4 字节时间加 2 字节地址），${CAP.dsEmbedded} 个锚点时为 ${BYTES.finalEmbeddedMany} 字节，再加一个就超出上限，所以是 ${CAP.dsEmbedded}。延后形态里，延后数据帧每个锚点增长 ${GROWTH.deferredReport} 字节，比 Poll 每个锚点 ${GROWTH.poll} 字节增长得快，所以它是轮中最长的一帧，上限由它决定，为 ${CAP.dsDeferred}。时隙的要求也随之变化：${FIG_ANCHORS} 个锚点时，嵌入形态需要 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs 的时隙，延后形态需要 ${(DEMAND.dsDeferred / 1000).toFixed(1)} µs。` },
    { text: `时隙数则多了一个：嵌入形态是 2A + 2 个，延后形态是 2A + 3 个，${FIG_ANCHORS} 个锚点时分别是 ${dsSlots(FIG_ANCHORS, 'embedded')} 个与 ${dsSlots(FIG_ANCHORS, 'deferred')} 个。多出的那一个就是延后数据帧的时隙（每个时隙放哪一帧是本仿真器的排法，标准只要求 Deferred Mode 为一时为延后数据帧另排时隙）。` },
    { kind: 'table', heading: '本课的场景里哪一端自己算出距离', head: [
      '形态', '标签', '锚点',
    ], rows: [
      ['SS-TWR 嵌入', '✓ 收到 Response 时', '✗'],
      ['SS-TWR 固定', '✓ 收到 Response 时', '✗'],
      ['SS-TWR 延后', '✓ 收到延后报文时', '✗'],
      ['DS-TWR 嵌入', '✓ 收到报告时', '✓ 收到 Final 时'],
      ['DS-TWR 延后', '✓ 收到报告时', '✓ 收到延后数据帧时'],
    ] },
    { text: `在本课的场景里，标签在五种形态中都能得到距离——它是发起方，四个时间最终都会汇集到它这里。双边测距的两种形态里锚点也能得到距离：嵌入形态的锚点在 ${FIG.anchorRangeUs} ms 就算出了 ${RANGE_M.ds} m（真值 ${BENCH_M.toFixed(2)} m），而标签要等到 ${FIG.tagRangeUs} ms 才算出同一个数，连最后一位都相同。把 Final 改为延后，锚点的那一行推迟到 ${FIG.anchorDeferredUs} ms，标签的那一行推迟到 ${FIG.tagDeferredUs} ms，数值不变。单边测距里锚点没有算出距离，因为四个时间中有两个只在标签手里；标准允许任何一端用 RRMC IE 的 TOF Request 字段请求对方把算好的距离发回（§10.29.8.3、§10.32.4），本课没有演示。` },
    { kind: 'steps', heading: '延后形态一轮的步骤（§10.32.5 图 10-237）', items: [
      '标签发送 Poll，一帧发给所有锚点。每个锚点为它的到达打时间戳。',
      `每个锚点在自己的时隙里发送 ${BYTES.respOne} 字节的 Response，并为这次发送打时间戳。此时它已得到自己的等待时间，但这一帧不携带任何时间值。`,
      '标签为每帧 Response 的到达打时间戳，于是它得到了与每个锚点之间的往返时间。',
      `标签发送 Final：${BYTES.finalDeferredOne} 字节，不带任何测量信息元素。锚点为它的到达打时间戳，得到自己的第二段往返时间；标签读回 Final 的实际发射时刻，得到每个锚点的第二段回复时延。`,
      `标签在下一个时隙发送延后数据帧（${BYTES.deferredReportOne} 字节）：一个 RMI 信息元素，为每个锚点列出往返时间与回复时延。锚点集齐四个时间，算出距离。`,
      `每个锚点发送 ${BYTES.report} 字节的报告，把自己测得的两个时间发回（发起方在 Poll 的 RRMC IE 里请求了这两个时间，§10.32.5 图 10-238）。标签集齐四个时间，算出距离。`,
    ] },
    { heading: '选择哪一种形态', text: '嵌入形态少一帧、少一个时隙，锚点也早一个时隙得到距离，但它要求发起方在发出 Final 之前就确定 Final 的发射时刻，并把据此算出的回复时延写进这一帧（标准用 RequestRrtiTx 参数让 MAC 插入 RRTI IE）。延后形态不需要这种能力：发起方事后读回发射时刻再报告，代价是多一帧、多一个时隙，以及一帧随锚点数增长更快的延后数据帧。两种形态都让锚点得到距离。' },
  ],
  deeper: [
    { heading: '延后数据帧里的地址', text: `延后数据帧是一帧广播数据帧，而标准规定广播帧里的 RMI IE 每个列表项都必须带地址（§10.29.8.4），所以每个锚点 ${GROWTH.deferredReport} 字节中有 ${UWB_SHORT_ADDR_BYTES} 字节是短地址。这个地址也告诉锚点发起方收到了它的 Response：没有收到的锚点，表中就没有它那一项，它算不出距离，也就不发送报告。锚点发给标签的报告是单播帧，目的地址已经说明了是谁，RMI 里那一项不再带地址（§10.29.8.4），所以报告是 ${BYTES.report} 字节。` },
    { heading: '一个上限，只属于一种形态', text: `按标准的字段宽度，${CAP.dsEmbedded} 这个数只属于嵌入式 Final，不能当作所有形态的上限。单边三种形态的轮次中根本没有 Final，它们最长的一帧是 Poll，上限是 ${CAP.ssEmbedded}；延后的双边形态最长的是延后数据帧，上限是 ${CAP.dsDeferred}。时隙长度同理：如果按嵌入式 Final 配置，一个单边轮次就要准备 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs 的时隙，去容纳一帧它根本不发送的帧。所以上限与时隙长度都不是固定的常数，要先确定这一轮中最长的是哪一帧。` },
  ],
  limits: [
    { kind: 'out-of-scope', text: '本课没有任何一条空口消息能启停或重配一次测距会话（标准 §10.29.6.2 那一节里控制的那一半）：Final 是否携带时间是场景中事先规定的配置，整个运行过程中不变。所以本课能回答「两种形态里各由哪一端得到距离」，不能回答「两台设备如何选定延后形态」；在真实部署中这是会话建立阶段的事，而本课没有会话建立过程。' },
    { kind: 'unmodelled', text: '两端不协商这件事。真实设备可以用 RRTN IE 提出自己期望的回复时延，由对方接受或另行协商（§10.29.8.6）；本仿真器没有实现这个信息单元，也没有承载它的帧，两端的形态由同一份会话配置给出。于是两端配置不一致的情形在本课中不会出现，也就无从观察。' },
    { kind: 'unmodelled', text: '本课的设备总是精确地在排定的时刻发送：设备就在时隙边界那一纳秒发射，所以四个时间只带接收时间戳的那一点噪声（而本课连这点噪声也设为零）。真实设备的收发转换、中断与调度都会使发送时刻产生抖动，这一抖动直接进入那段等待时间，而等待时间偏差 1 ns 就是约 15 cm 的距离误差。双边测距对它的容忍度高于单边，因为两个乘积会抵消一部分，但未被抵消的部分仍会全部计入距离。' },
    { kind: 'model-value', text: `字段宽度都按标准：RMI 表头 ${RMI_FIXED_BYTES} 字节（元素头 2 字节加 2 字节内容头），RRTI 表头 ${RRTI_FIXED_BYTES} 字节（元素头 2 字节加 1 字节内容头），每个时间 4 字节，短地址 2 字节。本仿真器的取值有两处：所有地址都用 2 字节的短地址（标准也允许 8 字节的扩展地址），以及嵌入式 Final 的 RRTI 列表项也带地址——标准允许在事先约定次序时省略（§10.29.8.1），本仿真器没有用这个选项。换成扩展地址或省略 RRTI 里的地址，${CAP.dsEmbedded} 与 ${CAP.dsDeferred} 这两个上限都要重新计算。` },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.6.6 与 §10.29.6.7 是一对一双边双向测距的两种时间信息形态——延后与嵌入：延后形态由发起方在之后的一帧消息里用 RMI IE 把往返时间与回复时延发给响应方，响应方随后算出距离；§10.32.5 是一对多的双边测距，图 10-236 是嵌入形态、图 10-237 是延后形态（ARC IE 的 Deferred Mode 字段，§10.32.9.1）；§10.29.1.2.3 给出它的计算式与用到的四个时间；§10.29.8.4 定义 RMI IE（图 10-212、10-213），§10.29.8.1 定义 RRTI IE（图 10-208、10-209）；BPRF 模式下一帧最长 127 字节的 PSDU 由 §16.2.7 的物理头长度字段决定。这一课完全不依赖任何草案。',
    '本仿真器自己的模型取值有三类：2 ms 的测距时隙（来自 FiRa 的缺省配置，不是标准正文）、时隙末尾 200 ns 的飞行守卫，以及短地址与 RRTI 列表项带地址这两项取法；帧头 9、RMI 表头 4、每个时间 4、短地址 2、RRTI 表头 3、帧校验 2 这些字段宽度都是标准的。锚点上限与最短时隙都是由这些宽度计算得出的。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都设为零，两端之间也没有墙，所以两种形态的读数可以逐位比较。开启噪声后的散布已在讲两端时钟的那两课中测量过。',
  ],
  scenario: () => uwbDeferredDsScenario('deferred'),
  variants: [
    { label: '嵌入：Final 把两个时间带给锚点', scenario: () => uwbDeferredDsScenario('embedded') },
  ],
  jumps: [
    J('Poll 从手机发出', firstUwbPoll),
    J(`Final：只剩 ${BYTES.finalDeferredOne} 字节`, firstUwbFinal),
    J('报告', firstUwbReport),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `Final 在 4 ms 处发出，${BYTES.finalDeferredOne} 字节。载入「嵌入」再看同一帧：${BYTES.finalEmbeddedOne} 字节——多出的 ${BYTES.finalEmbeddedOne - BYTES.finalDeferredOne} 个字节是 RMI 与 RRTI 两个信息元素；延后那一轮里，它们的内容出现在下一帧 ${BYTES.deferredReportOne} 字节的延后数据帧里。`,
    `整轮那一行，延后形态写着 "${dsSlots(1, 'deferred')} slots"，嵌入形态写着 "${dsSlots(1, 'embedded')} slots"：多出的那一个时隙给延后数据帧。`,
    `锚点那条泳道的测距行在 ${FIG.anchorDeferredUs} ms，手机那条在 ${FIG.tagDeferredUs} ms。载入「嵌入」，两行分别提前到 ${FIG.anchorRangeUs} ms 与 ${FIG.tagRangeUs} ms，数值完全相同。`,
  ],
  tryThis: [
    '在帧检视面板里打开延后那一轮的延后数据帧：一个 RMI 信息元素，列有这个锚点的往返时间与回复时延（treply2）。再载入「嵌入：Final 把两个时间带给锚点」打开 Final：同样两个数，分在 RMI 与 RRTI 两个信息元素里。',
    `在编辑器里把锚点加到十个，仍用嵌入形态：场景会被拒绝，因为 Final 需要 ${uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')} 字节，而一帧最多只能容纳 ${BYTES.psdu} 字节。把 Final 改为延后，同样十个锚点就能通过校验——${CAP.dsDeferred} 个以内都能通过，再多则是延后数据帧超出上限。`,
  ],
  quiz: [
    {
      q: '延后形态的 Final 不带任何测量信息元素。锚点怎样得到标签测得的那两个时间？',
      options: [
        '锚点从自己的时间戳推算出来',
        '标签在测量报告阶段发出一帧延后数据帧，用 RMI IE 为每个锚点列出这两个时间',
        '锚点得不到，只有标签能算出距离',
      ],
      answer: 1,
      explain: '§10.29.6.6 与 §10.32.5 图 10-237：发起方随后用一帧延后数据帧（RMI IE，Deferred Mode 为一）把往返时间与回复时延发给各响应方，响应方据此算出距离。',
    },
    {
      q: `为什么嵌入形态的锚点上限是 ${CAP.dsEmbedded}，延后却是 ${CAP.dsDeferred}？`,
      options: [
        '延后的一轮时隙更少，所以一个块中能容纳更多锚点',
        `上限由轮中最长的那一帧决定：嵌入式 Final 每锚点增长 ${GROWTH.finalEmbedded} 字节，延后数据帧每锚点只增长 ${GROWTH.deferredReport} 字节`,
        '延后形态放宽了对 PSDU 长度的要求',
      ],
      answer: 1,
      explain: `上限是按标准的字段宽度计算得出的：使最长的一帧仍能容纳于 ${BYTES.psdu} 字节的最大锚点数。改变的不是规则，而是哪一帧最长、它增长得多快。`,
    },
    {
      q: '在本课的场景里，延后形态与嵌入形态相比，锚点得到距离的结果有什么不同？',
      options: [
        '延后形态的锚点得不到距离',
        '两种形态锚点得到同一个距离，延后形态晚一个时隙',
        '延后形态的距离误差更大',
      ],
      answer: 1,
      explain: '四个时间都一样，只是标签的两个时间晚一帧送到：锚点在延后数据帧到达时算出距离，比嵌入形态晚一个时隙，数值相同。',
    },
  ],
}
