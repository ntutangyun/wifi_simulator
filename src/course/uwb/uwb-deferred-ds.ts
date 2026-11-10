/**
 * UWB Tier 1 · M14 两个时钟 · After the deferral the anchor is only a transponder.
 *
 * The second half of the reply-time pair. `uwb-reply-time` establishes the one
 * constraint — a frame cannot carry a number that measures its own transmit
 * instant — and walks the three SS-TWR shapes it creates. This lesson takes the
 * other half of the same question: whether DS-TWR's Final carries the two times
 * only the initiator can measure (§10.29.6.7, embedded) or leaves them out
 * (§10.29.6.6, deferred).
 *
 * The three things it is for, in the order it teaches them:
 *  - **The Final's length.** 14 + 12A embedded against 14 + 2A deferred, which at
 *    the embedded cap of nine anchors is 122 octets against 32.
 *  - **The cap that moves with it.** `UWB_MAX_ANCHORS = 9` was the embedded
 *    Final's own number; a deferred Final never overtakes the Poll, so the cap
 *    lands where the Poll puts it. Computed by `uwbMaxAnchors`, never typed.
 *  - **Design §7's table.** DS-TWR embedded is the only one of the five
 *    procedures in which BOTH ends end up holding a range. Defer the Final and
 *    the anchor is a transponder — it answers, and it never learns the distance.
 *
 * It loads `uwb-reply-time`'s own bench, built by the same function with
 * `method: 'ds'`: one anchor and one tag 5.00 m apart, crystals 35 ppm apart,
 * both noise sources off. The base scenario is the DEFERRED shape (the lesson's
 * subject, and the one whose anchor lane stays empty); the single variant is the
 * embedded Final, which is where the anchor's own range appears.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-deferred-ds.test.ts.
 * `npx tsx scripts/lesson-dump.ts uwb-deferred-ds` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import {
  J, firstUwbFinal, firstUwbPoll, firstUwbRange, firstUwbReport, type Lesson,
} from '../lessonKit'
import {
  RMI_FINAL_DEFERRED_ENTRY_BYTES, RMI_FINAL_ENTRY_BYTES, RMI_FINAL_FIXED_BYTES, RRTI_IE_BYTES,
  UWB_FCS_BYTES, UWB_MHR_BYTES, UWB_MAX_PSDU_BYTES, UWB_REPORT_BYTES, uwbFinalBytes,
  uwbPollBytes, uwbRespBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../uwb/phy'
import { BENCH_M, CAP, RANGE_M, uwbReplyTimeScenario } from './uwb-reply-time'

/** The bench of `uwb-reply-time`, measured the other way: the same two devices, DS-TWR. */
export function uwbDeferredDsScenario(replyTime: 'embedded' | 'deferred'): Scenario {
  return uwbReplyTimeScenario(replyTime, 'ds')
}

/** The anchor count the figure and the octet table are drawn at: the embedded Final's own cap. */
export const FIG_ANCHORS = CAP.dsEmbedded

/** Octets of the round's frames, from the PHY — never typed as literals. */
export const BYTES = {
  pollOne: uwbPollBytes(1),
  respOne: uwbRespBytes('ds'),
  report: UWB_REPORT_BYTES,
  finalEmbeddedOne: uwbFinalBytes(1, 'embedded'),
  finalDeferredOne: uwbFinalBytes(1, 'deferred'),
  finalEmbeddedMany: uwbFinalBytes(FIG_ANCHORS, 'embedded'),
  finalDeferredMany: uwbFinalBytes(FIG_ANCHORS, 'deferred'),
  pollMany: uwbPollBytes(FIG_ANCHORS),
  psdu: UWB_MAX_PSDU_BYTES,
} as const

/** What the deferred Final drops: the round trips and the whole RRTI list. */
export const DROPPED_BYTES = BYTES.finalEmbeddedMany - BYTES.finalDeferredMany

/** Slot demand at {@link FIG_ANCHORS} anchors, per shape, in nanoseconds. */
export const DEMAND = {
  dsEmbedded: uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded'),
  dsDeferred: uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'deferred'),
} as const

/**
 * The instants the two rounds put on the air, in microseconds, exactly as the
 * timeline records them. Read back out of the run in the test, so the prose
 * cannot drift from it.
 */
export const FIG = {
  slotUs: 2000,
  /** The anchor finishes when the Final lands — in the embedded round only. */
  anchorRangeUs: '4.194',
  /** The tag finishes when the report lands, in both rounds, on the same number. */
  tagRangeUs: '6.191',
} as const

/**
 * The embedded Final at nine anchors, field by field, drawn to scale — and the
 * deferred one drawn inside it, because the deferred Final is not a different
 * frame but this frame with two boxes taken out. The two boxes that go are 90 of
 * the 122 octets, which is the whole lesson in one picture: what is left is a
 * list of addresses, and a list of addresses is not a measurement.
 */
export function uwbDeferredDsFields(): FieldsSpec {
  const fields = [
    { label: `MHR ${UWB_MHR_BYTES}`, size: UWB_MHR_BYTES },
    { label: `RMI 表头 ${RMI_FINAL_FIXED_BYTES}`, size: RMI_FINAL_FIXED_BYTES },
    { label: `短地址 ×${FIG_ANCHORS}`, size: RMI_FINAL_DEFERRED_ENTRY_BYTES * FIG_ANCHORS },
    {
      label: `往返时间 ×${FIG_ANCHORS}`,
      size: (RMI_FINAL_ENTRY_BYTES - RMI_FINAL_DEFERRED_ENTRY_BYTES) * FIG_ANCHORS,
    },
    { label: `RRTI IE ×${FIG_ANCHORS}`, size: RRTI_IE_BYTES * FIG_ANCHORS },
    { label: `FCS ${UWB_FCS_BYTES}`, size: UWB_FCS_BYTES },
  ]
  const total = fields.reduce((n, f) => n + f.size, 0)
  return {
    kind: 'fields',
    fields,
    unit: 'B',
    total: `嵌入 ${total} 字节，延后 ${BYTES.finalDeferredMany} 字节，差 ${DROPPED_BYTES} 在中间两格`,
  }
}

export const uwbDeferredDs: Lesson = {
  id: 'uwb-deferred-ds',
  module: 15,
  title: '本课的延后形态里，锚点只是一个应答器',
  why: '上一课讲完了单边双向测距（single-sided two-way ranging, SS-TWR）的三种方式。双边双向测距（double-sided two-way ranging, DS-TWR）面对同一个问题的另一半：标签（tag）自己测得的那两个时间——第一次往返的往返时间与第二次往返的回复时延（reply time）——怎样交给锚点（anchor）。嵌入形态把它们写入 Final（标准 §10.29.6.7、§10.32.5），锚点收到 Final 时即集齐四个时间并算出距离。标准的延后形态（§10.29.6.6；一对多时由 ARC IE 的 Deferred Mode 字段指示）把这两个时间改放在测量报告阶段的一帧数据帧（data frame）里发给锚点，锚点晚一些仍能算出距离。本课场景的「延后」与标准不同：Final 不带时间，之后也不再补发；Final 里只留一份已作答锚点的名单，锚点依据这份名单决定是否在报告阶段发送——名单和这条规则都是本课的取法，标准没有规定。于是在本课里，每增加一个锚点，Final 只增长两个字节，而不是十几个；它不再是轮中最长的一帧，最长的变为 Poll，按本课的字段宽度，锚点上限从个位数放宽到三十多个，时隙也可以更短，而时隙的个数完全不变。代价由锚点承担：它仍然作答、仍然把自己的两个时间写入报告发回，却拿不到标签的那两个时间，算不出距离，成为一个只负责作答的应答器（transponder）——这是本课场景的结果，不是标准延后形态的结果。标签一侧没有任何损失，报告一到即算出同一个数。如果锚点只是墙上的参照点，这几乎没有代价；如果它自己需要使用这个距离，比如用于开门，就要用嵌入形态或标准的延后形态，本课只演示了前者。',
  outcomes: [
    '算出两种 Final 的长度，以及它们各自换来的锚点上限',
    '说明本课延后的 Final 为什么不为空，以及本课的延后形态与标准的延后形态有什么不同',
    '说出在本课的场景里五种测距形态中哪一端能得到距离，以及为什么只有一种形态两端都能得到',
  ],
  needs: ['uwb-dstwr', 'uwb-reply-time'],
  terms: [
    { term: 'RMI', plain: 'Ranging Measurement Information IE：把回复时延、往返时间、飞行时间等测量发给一个或多个设备的信息元素（§10.29.8.4），其中至少要有一项测量；本课的 Final 与报告各带一份' },
    { term: 'Deferred Mode', plain: 'ARC IE 与 RMI IE 中的一个字段：置一时，测距交互之后另排时隙发送延后的数据帧，用来传递回复时延、往返时间等测量（§10.32.9.1、§10.29.8.4）；本课场景的「延后」只借用了这个名字，做法不同' },
    { term: 'transponder', plain: '本课的说法，不是标准术语：只负责作答、自身不计算距离的设备' },
    { term: 'PSDU', plain: '一帧中实际承载消息的部分，BPRF 模式下最长 127 字节（HPRF 模式可以更长）' },
  ],
  picture: [
    { heading: 'Final 中那两个只有标签能测得的数', text: '双边测距的四个时间，两端各测两个。锚点测得的两个（它自己的等待时间、它自己的往返时间）由它自己持有；标签测得的两个却只有标签持有，而锚点必须得到它们——否则那个消去两端时钟误差的公式只有一半的输入；标准也说明，双边测距通常由响应方计算距离（§10.29.8.3）。嵌入形态中，往返时间按锚点逐个写入 Final 的测距测量信息（ranging measurement information, RMI）信息元素，回复时延写入 RRTI IE（§10.29.6.7），一帧发给所有锚点：锚点收到 Final 时即可算出距离。' },
    { kind: 'watch', jump: 1, heading: `一帧 ${BYTES.finalDeferredOne} 字节的 Final`, text: `载入仿真。跳到 Final：它只有 ${BYTES.finalDeferredOne} 字节，而嵌入形态同一个场景里的 Final 有 ${BYTES.finalEmbeddedOne} 字节。再看锚点那条泳道——它这一轮中没有任何测距行。` },
    { heading: '本课的 Final 为什么不为空', text: `在标准的一对多延后形态里（§10.32.5 图 10-237），Final 只是一帧测距帧，不带测量信息元素；那两个时间放在之后的延后数据帧里。本课场景的做法不同：锚点要依据 Final 判断自己的 Response 是否已被标签收到——收到了才在报告阶段发送，未收到就保持沉默——判断的依据是 Final 中的响应方名单。这条规则是本课的取法，标准没有规定；而且标准要求 RMI IE 至少带一项测量，只列地址的 RMI 在标准里并不合法。所以本课延后的 Final 并不为空：RMI 的表头仍在，每个响应方两个字节的短地址仍在，末尾两个字节的帧校验序列（frame check sequence, FCS）也仍在，移除的只是每个响应方四个字节的往返时间，以及承载标签自身等待时间的那一组信息单元。于是每增加一个锚点它只增长 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 个字节，而不是 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 个。` },
    { heading: '本课里锚点因此只是一个应答器', text: '本课的这一帧不携带时间，之后也没有补发，锚点就始终只有它自己测得的那两个时间。它仍然按时作答，仍然把自己的两个数写入报告发回，却无法算出距离——它从测距的另一方参与者，变成了一个只负责作答的应答器（transponder）。标签一侧没有任何损失：报告一到，四个时间齐全，照常算出距离。按标准的延后形态，发起方会在测量报告阶段把这两个时间补发给锚点，锚点只是晚一些算出距离，并不会成为应答器。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: `${FIG_ANCHORS} 个锚点的 Final，逐个字段查看`, spec: uwbDeferredDsFields(),
      caption: `按本课的字段宽度、按字节数绘制的嵌入式 Final。本课延后的那一帧不是另一种帧，而是同一帧去掉中间两格：${DROPPED_BYTES} 个字节中，一半是每个锚点四字节的往返时间，一半是每个锚点六字节的回复时延（reply time）——本课把每个锚点的回复时延各放进一个信息单元（2 字节头加 4 字节时间），而标准的一个 RRTI IE 可以列出多个回复时延。剩下的四格——帧头（MAC header）、表头、九个短地址、帧校验——就是本课延后 Final 的全部内容。`,
    },
    { kind: 'table', heading: '本课的两种 Final，两个上限', head: [
      '这一帧', '嵌入', '延后',
    ], rows: [
      ['Final 长度', `${uwbFinalBytes(0, 'embedded')} + ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES}A`, `${uwbFinalBytes(0, 'deferred')} + ${RMI_FINAL_DEFERRED_ENTRY_BYTES}A`],
      [`A = 1（本课这一轮）`, `${BYTES.finalEmbeddedOne} B`, `${BYTES.finalDeferredOne} B`],
      [`A = ${FIG_ANCHORS}`, `${BYTES.finalEmbeddedMany} B`, `${BYTES.finalDeferredMany} B`],
      ['轮中最长的一帧', 'Final', `Poll，${BYTES.pollMany} B`],
      ['锚点上限', String(CAP.dsEmbedded), String(CAP.dsDeferred)],
      [`A = ${FIG_ANCHORS} 时的最短时隙`, `${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs`, `${(DEMAND.dsDeferred / 1000).toFixed(1)} µs`],
    ] },
    { heading: '上限是计算得出的，不是人为规定的', text: `一帧的 PSDU（PHY service data unit）最长 ${BYTES.psdu} 字节，这是 BPRF 模式的物理头（PHY header, PHR）中 7 位长度字段能表示的上限（§16.2.7；HPRF 模式的物理头能表示更长的帧，本课不涉及）。锚点上限就是「轮中最长的那一帧仍能容纳」的最大锚点数，下面的字节数都按本课的字段宽度计算：嵌入式 Final 每增加一个锚点增长 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 字节，${CAP.dsEmbedded} 个锚点时为 ${BYTES.finalEmbeddedMany} 字节，再加一个就超出上限，所以是 ${CAP.dsEmbedded}。采用延后形态后，它每个锚点只增长 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节，比 Poll 每个锚点 3 字节增长得更慢，所以在 Final 达到这一上限之前，Poll 就已经成为轮中最长的一帧——于是上限由 Poll 决定，为 ${CAP.dsDeferred}。时隙的要求也随之放宽：${FIG_ANCHORS} 个锚点时，嵌入式需要 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs 的时隙，延后的只需 ${(DEMAND.dsDeferred / 1000).toFixed(1)} µs，节省 ${((DEMAND.dsEmbedded - DEMAND.dsDeferred) / 1000).toFixed(1)} µs。` },
    { text: `在本课的轮次排法里（时隙数是本课的取法），时隙数完全没有减少：两种形态都是 2A + 2 个，${FIG_ANCHORS} 个锚点时都是 ${uwbSlotsPerTag('ds', FIG_ANCHORS)} 个。延后形态没有省去任何一个时隙，它只是改由另一帧携带那几个时间——锚点侧的时间仍在报告中，而报告本来就有自己的时隙。` },
    { kind: 'table', heading: '本课的场景里哪一端自己算出距离', head: [
      '形态', '标签', '锚点',
    ], rows: [
      ['SS-TWR 嵌入', '✓ 收到 Response 时', '✗'],
      ['SS-TWR 固定', '✓ 收到 Response 时', '✗'],
      ['SS-TWR 延后', '✓ 收到延后报文时', '✗'],
      ['DS-TWR 嵌入', '✓ 收到报告时', '✓ 收到 Final 时'],
      ['DS-TWR 延后', '✓ 收到报告时', '✗'],
    ] },
    { text: `在本课的场景里，标签在五种形态中都能得到距离——它是发起方，四个时间最终都会汇集到它这里。只有 DS-TWR 嵌入这一种形态使锚点也能得到距离，依靠的正是 Final 中的那两格：本课这一轮中，嵌入形态的锚点在 ${FIG.anchorRangeUs} ms 就算出了 ${RANGE_M.ds} m（真值 ${BENCH_M.toFixed(2)} m），而标签要等到 ${FIG.tagRangeUs} ms 才算出同一个数，连最后一位都相同。把 Final 改为延后，${FIG.anchorRangeUs} ms 那一行就整行消失，标签那一行则完全不变。标准里并非只有这一种结果：标准的延后形态会在测量报告阶段把标签的两个时间发给锚点（§10.32.5），锚点同样能算出距离；而且任何一端都可以用 RRMC IE 的 TOF Request 字段请求对方把算好的距离发回（§10.29.8.3、§10.32.4）。表中的 ✗ 只说明本课场景里那一端自己没有算出距离。` },
    { kind: 'steps', heading: '本课场景中延后形态一轮的步骤（与标准的延后形态不同）', items: [
      '标签发送 Poll，一帧发给所有锚点。每个锚点为它的到达打时间戳。',
      `每个锚点在自己的时隙里发送 ${BYTES.respOne} 字节的 Response，并为这次发送打时间戳。此时它已得到自己的等待时间，但这一帧不携带任何时间值。`,
      '标签为每帧 Response 的到达打时间戳，于是它得到了与每个锚点之间的往返时间。',
      `（本课的取法，标准未规定）标签发送 Final：${BYTES.finalDeferredOne} 字节，只列出已作答的锚点，不携带任何时间值。锚点收到它，得知自己的 Response 已被收到，因而知道自己应发送报告——但它无法算出距离，因为计算距离所需的那两个数不在这一帧中。`,
      `每个锚点发送 ${BYTES.report} 字节的报告，把自己测得的两个时间发回（标准允许发起方在 Poll 的 RRMC IE 里请求这两个时间，响应方随后各用一帧数据帧发回：§10.32.5）。标签集齐四个时间，算出距离。本课的一轮到此结束，只有标签算出了距离。`,
      '（标准有、本课没有的一步）在标准的延后形态里，测量报告阶段还有一帧：标签用 RMI IE 把自己测得的两个时间发给各锚点（§10.32.5 图 10-237），锚点随后也能算出距离。',
    ] },
    { heading: '这项代价由谁承担', text: '如果锚点本来就不需要知道距离——它只是墙上一个用于手机定位的参照点——那本课的延后形态几乎没有代价：帧变短、上限放宽、时隙变短，时隙数也没有增加。如果锚点自己需要使用这个距离，比如用于开门，或者自行判断是否唤醒其他设备，本课的延后形态就使锚点无法得到这个距离。标准为此提供了办法：标准的延后形态本身会在测量报告阶段把标签的两个时间补发给锚点；标签也可以把算好的距离用 RMI IE 发给锚点。这两种流程本课都没有演示。' },
  ],
  deeper: [
    { heading: '本课为什么不省掉名单', text: `在本课「锚点依据 Final 决定是否发送报告」这条规则下，如果把名单也去掉，Final 就成为一帧 ${UWB_MHR_BYTES + UWB_FCS_BYTES} 字节、不携带任何信息的帧——每个锚点都收到了它，却没有一个知道自己上一帧是否已被收到。于是要么所有锚点都在报告阶段发送（包括 Response 丢失的那些锚点，它们会报告一段无法与任何往返时间对应的数值），要么都不发送。在这条规则下，名单是避免这两种不良结果的唯一办法，代价是每个锚点两个字节。标准没有这条规则：响应方要在报告阶段发回什么，由发起方在 RRMC IE 里请求了什么决定（§10.29.8.3），标准延后形态的 Final 也不带名单。` },
    { heading: '一个上限，只属于一种形态', text: `按本课的字段宽度，${CAP.dsEmbedded} 这个数只属于嵌入式 Final，不能当作所有形态的上限。本课单边三种形态的轮次中根本没有 Final，它们最长的一帧是 Poll，上限是 ${CAP.ssEmbedded}；延后的双边形态也是如此。时隙长度同理：如果按嵌入式 Final 配置，一个单边轮次就要准备 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs 的时隙，去容纳一帧它根本不发送的帧。所以上限与时隙长度都不是固定的常数，要先确定这一轮中最长的是哪一帧。` },
  ],
  limits: [
    { kind: 'out-of-scope', text: '本课没有任何一条空口消息能启停或重配一次测距会话（标准 §10.29.6.2 那一节里控制的那一半）：Final 是否携带时间是场景中事先规定的配置，整个运行过程中不变。所以本课能回答「本课的延后形态里哪一端能得到距离」，不能回答「两台设备如何选定延后形态」；在真实部署中这是会话建立阶段的事，而本课没有会话建立过程。' },
    { kind: 'unmodelled', text: '两端不协商这件事。真实设备可以用 RRTN IE 提出自己期望的回复时延，由对方接受或另行协商；本课中没有这个信息单元，也没有承载它的帧。于是两端配置不一致的情形在本课中既不会被发现，也不会被纠正：锚点会在 Final 中查找两个不存在的数，然后不做任何计算——而时间轴上不会有任何一行说明原因。' },
    { kind: 'unmodelled', text: '本课的设备总是精确地在排定的时刻发送：设备就在时隙边界那一纳秒发射，所以四个时间只带接收时间戳的那一点噪声（而本课连这点噪声也设为零）。真实设备的收发转换、中断与调度都会使发送时刻产生抖动，这一抖动直接进入那段等待时间，而等待时间偏差 1 ns 就是约 15 cm 的距离误差。双边测距对它的容忍度高于单边，因为两个乘积会抵消一部分，但未被抵消的部分仍会全部计入距离。' },
    { kind: 'model-value', text: `这一课每一个字节数都按本课的排法计算：RMI 表头 ${RMI_FINAL_FIXED_BYTES} 字节、嵌入式每响应方 ${RMI_FINAL_ENTRY_BYTES} 字节、延后每响应方 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节、每段回复时延一节 ${RRTI_IE_BYTES} 字节。标准的图 10-212、10-213、10-208、10-209 给出了 RMI IE 与 RRTI IE 各字段的宽度：往返时间与回复时延各 4 字节、短地址 2 字节，本课的每响应方宽度与之一致；但标准的 RMI 控制部分是 2 字节、每个信息元素还有自己的头，一个 RRTI IE 可以列出多个回复时延，而且 RMI 至少要带一项测量——本课的 ${RMI_FINAL_FIXED_BYTES} 字节表头、每个回复时延各占一个信息单元、只列地址的延后 RMI，都是本课自己的排法。所以「每锚点 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 字节对每锚点 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节」以及由此推出的 ${CAP.dsEmbedded} 与 ${CAP.dsDeferred} 这两个上限，都取决于这些取值——换一种编址或编码，两个上限都要重新计算。但结论的方向不会改变：延后的 Final 每锚点的增长比 Poll 慢，所以上限一定由 Poll 决定。` },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.6.6 与 §10.29.6.7 是一对一双边双向测距的两种时间信息形态——延后与嵌入：延后形态由发起方在之后的一帧消息里用 RMI IE 把往返时间与回复时延发给响应方，响应方随后算出距离；§10.32.5 是一对多的双边测距，ARC IE（§10.32.9.1）的 Deferred Mode 字段决定这两个时间放在 Final 里还是放在测量报告阶段的延后数据帧里；§10.29.1.2.3 给出它的计算式与用到的四个时间，§10.29.1.2.4 说明三帧的形式；§10.29.8.4 定义承载这些时间值的信息单元，§10.29.8.1 定义承载回复时延的信息单元（RRTI IE）；BPRF 模式下一帧最长 127 字节的 PSDU 由 §16.2.7 的物理头长度字段决定。这一课完全不依赖任何草案。',
    '本仿真器自己的模型取值有三类：2 ms 的测距时隙（来自 FiRa 的缺省配置，不是标准正文）、时隙末尾 200 ns 的飞行守卫，以及本课那张字节表所依据的各字段宽度（帧头 9、RMI 表头 3、嵌入式每响应方 6、延后每响应方 2、每段回复时延 6、帧校验 2）。锚点上限与最短时隙都是由这些宽度计算得出的，不是标准给出的数。另外，本课「延后」的做法也是本课自己的：Final 只列名单、锚点据此决定是否发送报告、标签不再补发自己的两个时间——这三点都不是标准延后形态的规定。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都设为零，两端之间也没有墙，所以两种形态的读数可以逐位比较。开启噪声后的散布已在讲两端时钟的那两课中测量过。',
  ],
  scenario: () => uwbDeferredDsScenario('deferred'),
  variants: [
    { label: '嵌入：Final 把两个时间带给锚点', scenario: () => uwbDeferredDsScenario('embedded') },
  ],
  jumps: [
    J('Poll 从手机发出', firstUwbPoll),
    J(`Final：只剩 ${BYTES.finalDeferredOne} 字节的一份名单`, firstUwbFinal),
    J('锚点的报告', firstUwbReport),
    J('测距行：只有手机这一条', firstUwbRange),
  ],
  observe: [
    `Final 在 4 ms 处发出，${BYTES.finalDeferredOne} 字节。载入「嵌入」再看同一帧：${BYTES.finalEmbeddedOne} 字节——多出的 ${BYTES.finalEmbeddedOne - BYTES.finalDeferredOne} 个字节是这个锚点的往返时间（${RMI_FINAL_ENTRY_BYTES - RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节），以及承载标签自身等待时间的那个信息单元（${RRTI_IE_BYTES} 字节）；短地址两种形态都有。`,
    `整轮那一行两种形态都写着 "${uwbSlotsPerTag('ds', 1)} slots"：延后形态没有节省任何一个时隙，节省的只有字节。`,
    `本轮只有一条测距行，在 ${FIG.tagRangeUs} ms、手机那条泳道上。载入「嵌入」，锚点那条泳道会在 ${FIG.anchorRangeUs} ms 多出一条，数值与手机那条完全相同。`,
  ],
  tryThis: [
    `载入「嵌入：Final 把两个时间带给锚点」，在帧检视面板里打开 Final：一份 RMI 中列有这个锚点的短地址与往返时间，后面还有一个承载标签自身等待时间的信息单元。回到延后那一轮再打开同一帧：只剩短地址。这 ${BYTES.finalEmbeddedOne - BYTES.finalDeferredOne} 个字节的差额，就是锚点那条测距行的全部代价。`,
    `在编辑器里把锚点加到十个，仍用嵌入形态：场景会被拒绝，因为 Final 需要 ${uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')} 字节，而一帧最多只能容纳 ${BYTES.psdu} 字节。把 Final 改为延后，同样十个锚点就能通过校验——${CAP.dsDeferred} 个以内都能通过。`,
  ],
  quiz: [
    {
      q: '本课延后的 Final 里还留着一份响应方名单。在本课的规则下，为什么不能连它一起省掉？',
      options: [
        '标准规定每一帧都必须带收件人列表',
        '锚点要依据它判断自己上一帧是否已被收到，这决定它是否应在报告阶段发送',
        '名单用于校验，缺少它这一帧就无法通过帧校验',
      ],
      answer: 1,
      explain: '本课的锚点依据名单判断自己是否应发送报告。没有名单，Response 丢失的锚点也会发送，报告一段无法与任何往返时间对应的数值。这条规则是本课场景的，标准没有规定；标准延后形态的 Final 也不带名单。',
    },
    {
      q: `为什么嵌入形态的锚点上限是 ${CAP.dsEmbedded}，延后却是 ${CAP.dsDeferred}？`,
      options: [
        '延后的一轮时隙更少，所以一个块中能容纳更多锚点',
        `上限由轮中最长的那一帧决定：嵌入式 Final 每锚点增长 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 字节，延后的只增长 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节，于是改由 Poll 决定上限`,
        '延后形态放宽了对 PSDU 长度的要求',
      ],
      answer: 1,
      explain: `上限是按本课的字段宽度计算得出的：使最长的一帧仍能容纳于 ${BYTES.psdu} 字节的最大锚点数。改变的不是规则，而是哪一帧最长。`,
    },
    {
      q: '在本课的场景里，五种测距形态中为什么只有 DS-TWR 嵌入这一种两端都能得到距离？',
      options: [
        '因为它是唯一一种做两次往返的',
        '因为只有它的 Final 把标签测得的那两个时间发送给了锚点',
        '因为只有它的报告是双向的',
      ],
      answer: 1,
      explain: '两次往返是必要条件，但不是充分条件——本课把那两个时间从 Final 中移除、之后也不补发，四个时间就只有标签持有，锚点成为一个应答器。标准的延后形态会在测量报告阶段把这两个时间补发给锚点，所以在标准里延后形态的锚点同样能算出距离。',
    },
  ],
}
