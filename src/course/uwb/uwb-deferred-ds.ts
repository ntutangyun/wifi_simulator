/**
 * UWB Tier 1 · M14 两只钟 · After the deferral the anchor is only a transponder.
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
  module: 13,
  title: '延后之后，锚点就只是一个应答器',
  why: '上一课把单边双向测距（single-sided two-way ranging, SS-TWR）的三条走法走完了。双边双向测距（double-sided two-way ranging, DS-TWR）面对同一个问题的另一半：Final 这一帧要不要携带标签（tag）自己量的那两个时间。这不只是几十个字节的事——Final 是全轮最长的一帧，被它卡住的锚点（anchor）上限、被它撑大的时隙长度都跟着它走；而把它掏空还要多付一笔，那笔账记在锚点头上。',
  outcomes: [
    '算出两种 Final 的长度，以及它们各自换来的锚点上限',
    '说清延后的 Final 为什么不能是空的、剩下那份名单是给谁用的',
    '说出五种测距形态里谁手里有距离，以及为什么只有一种两端都有',
  ],
  needs: ['uwb-dstwr', 'uwb-reply-time'],
  terms: [
    { term: 'RMI', plain: '帧里专门写这些时间段的那一部分，Final 与报告各有一份' },
    { term: 'deferred ranging time information', plain: '把 Final 该带的时间挪走，只留名单' },
    { term: 'transponder', plain: '只负责作答、自己不测量的那种设备' },
    { term: 'PSDU', plain: '一帧里真正装消息的那一段，最长 127 字节' },
  ],
  picture: [
    { heading: 'Final 里那两个只有标签量得到的数', text: '双边测距的四个时间，两端各量两个。锚点量的两个（它自己的等待、它自己的往返）在它自己手里；标签量的两个却只在标签手里，而锚点非有它们不可——否则那条把两只钟消掉的式子只剩一半。嵌入形态里，这两个数逐锚点写进 Final 的测距测量信息（ranging measurement information, RMI）那一段，一帧发给所有锚点：锚点收到 Final 的同一刻就把距离算出来了。' },
    { kind: 'watch', jump: 1, heading: `一帧 ${BYTES.finalDeferredOne} 字节的 Final`, text: `载入仿真。跳到 Final：它只有 ${BYTES.finalDeferredOne} 字节，而嵌入形态同一个场景里的 Final 有 ${BYTES.finalEmbeddedOne} 字节。再看锚点那条泳道——它这一轮里一条测距行都没有。` },
    { heading: '那为什么不干脆发一帧空的', text: `因为锚点还要靠这一帧回答一个问题：我的 Response，标签究竟收到没有？收到了，它才该在报告相位里开口；没收到，它这一轮就该闭嘴。这个判据在引擎里就叫 finalListedMe——它读的正是 Final 里的响应方名单。所以延后的 Final 不是空的：RMI 的表头还在，每个响应方两个字节的短地址还在，收尾那两个字节的帧校验序列（frame check sequence, FCS）当然也还在，走掉的只是每个响应方四个字节的往返时间，和那一整串装着标签自己那段等待的小节。于是它每多一个锚点只长 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 个字节，而不是 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 个。` },
    { heading: '锚点从此只是一个应答器', text: '这一帧一掏空，锚点手里就永远只有它自己量的那两个时间。它照样按时作答，照样把自己那两个数写进报告交回去，却再也算不出距离——它从测距的另一半参与者，退成了一个只负责作答的应答器（transponder）。标签那边什么都没少：报告一到，四个时间凑齐，距离照旧。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: `${FIG_ANCHORS} 个锚点的 Final，一格一格看`, spec: uwbDeferredDsFields(),
      caption: `按字节数画的嵌入式 Final。延后的那一帧不是另一种帧，是同一帧拿掉中间两格：${DROPPED_BYTES} 个字节里，一半是每个锚点四字节的往返时间，一半是每个锚点一节六字节的回复时延（reply time）。剩下的四格——帧头（MAC header）、表头、九个短地址、帧校验——就是全部。`,
    },
    { kind: 'table', heading: '两种 Final，两个上限', head: [
      '这一帧', '嵌入', '延后',
    ], rows: [
      ['Final 长度', `${uwbFinalBytes(0, 'embedded')} + ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES}A`, `${uwbFinalBytes(0, 'deferred')} + ${RMI_FINAL_DEFERRED_ENTRY_BYTES}A`],
      [`A = 1（本课这一轮）`, `${BYTES.finalEmbeddedOne} B`, `${BYTES.finalDeferredOne} B`],
      [`A = ${FIG_ANCHORS}`, `${BYTES.finalEmbeddedMany} B`, `${BYTES.finalDeferredMany} B`],
      ['轮里最长的一帧', 'Final', `Poll，${BYTES.pollMany} B`],
      ['锚点上限', String(CAP.dsEmbedded), String(CAP.dsDeferred)],
      [`A = ${FIG_ANCHORS} 时的最短时隙`, `${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs`, `${(DEMAND.dsDeferred / 1000).toFixed(1)} µs`],
    ] },
    { heading: '上限是算出来的，不是写下来的', text: `一帧的 PSDU（PHY service data unit）最长 ${BYTES.psdu} 字节，这是物理头（PHY header, PHR）那个长度字段能表达的极限。上限就是「轮里最长的那一帧还塞得进去」的最大锚点数：嵌入式 Final 每多一个锚点长 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 字节，${CAP.dsEmbedded} 个是 ${BYTES.finalEmbeddedMany} 字节，再加一个就越界，所以是 ${CAP.dsEmbedded}。延后之后它每锚点只长 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节，早在追上 Poll 之前就被 Poll 反超了——于是卡住这一轮的换成了 Poll（每锚点 3 字节），上限落到 ${CAP.dsDeferred}。时隙也一起松开：${FIG_ANCHORS} 个锚点时，嵌入式要 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs 的时隙，延后的只要 ${(DEMAND.dsDeferred / 1000).toFixed(1)} µs，省下 ${((DEMAND.dsEmbedded - DEMAND.dsDeferred) / 1000).toFixed(1)} µs。` },
    { text: `时隙数一个都没省：两种形态都是 2A + 2 个，${FIG_ANCHORS} 个锚点都是 ${uwbSlotsPerTag('ds', FIG_ANCHORS)} 个。延后没有搬走任何一个时隙，它只是把那几个时间搬了家——锚点侧的时间照旧在报告里，而报告本来就有自己的时隙。` },
    { kind: 'table', heading: '谁手里有距离', head: [
      '形态', '标签', '锚点',
    ], rows: [
      ['SS-TWR 嵌入', '✓ 收到 Response 时', '✗'],
      ['SS-TWR 固定', '✓ 收到 Response 时', '✗'],
      ['SS-TWR 延后', '✓ 收到延后报文时', '✗'],
      ['DS-TWR 嵌入', '✓ 收到报告时', '✓ 收到 Final 时'],
      ['DS-TWR 延后', '✓ 收到报告时', '✗'],
    ] },
    { text: `标签在五种形态里都拿得到距离——它是发起方，四个时间最后总要汇到它这里。只有 DS-TWR 嵌入这一种让锚点也拿到，而它靠的正是 Final 里那两格：本课这一轮里，嵌入形态的锚点在 ${FIG.anchorRangeUs} ms 就算出了 ${RANGE_M.ds} m（真值 ${BENCH_M.toFixed(2)} m），而标签要等到 ${FIG.tagRangeUs} ms 才算出同一个数，连最后一位都一样。把 Final 延后，${FIG.anchorRangeUs} ms 那一行就整行消失，标签那一行一个字都不变。` },
    { kind: 'steps', heading: '延后的一轮，一步一步', items: [
      '标签发 Poll，一帧问所有锚点。每个锚点给它的到达打戳。',
      `每个锚点在自己的时隙里发 ${BYTES.respOne} 字节的 Response，给自己这一发打戳。此刻它手里有自己的那段等待，但这一帧不带任何时间。`,
      '标签给每帧 Response 的到达打戳，于是它握有对每个锚点的那次往返。',
      `标签发 Final：${BYTES.finalDeferredOne} 字节，只列出答过话的锚点，一个时间都不带。锚点收到它，知道自己被听见了，也就知道自己可以开口——但它算不出距离，因为算距离要的那两个数不在这一帧里。`,
      `每个锚点发 ${BYTES.report} 字节的报告，把自己量的两个时间交回去。标签四个时间凑齐，算出距离。这一轮里只有它算出来了。`,
    ] },
    { heading: '这笔账该记在谁头上', text: '如果锚点本来就不需要知道距离——它只是墙上一个替手机定位的参照点——那延后几乎是白捡的：帧短了、上限松了、时隙短了，时隙数还一个没多。如果锚点自己要用这个距离，比如它要开一扇门、或者要自己判断该不该唤醒别的东西，那延后就把这条路掐断了，除了让标签事后再告诉它一次，没有别的办法。而那条路本仿真器没有建模。' },
  ],
  deeper: [
    { heading: '为什么名单不能也省掉', text: `把名单也拿掉，Final 就成了一帧 ${UWB_MHR_BYTES + UWB_FCS_BYTES} 字节的纯粹标点——每个锚点都收到了它，却没有一个知道自己上一帧有没有被听见。于是要么所有锚点都在报告相位里开口（包括 Response 丢掉了的那些，它们会报出一段配不上任何往返时间的数），要么都不开口。名单是这两种坏结果之间唯一的出路，而它的代价是每个锚点两个字节。这也是这一刀设计时先定下来的一条：延后的 Final 不是空的，它是一份名单。` },
    { heading: '一个常数，曾经压在四种形态上', text: `${CAP.dsEmbedded} 这个数从来就只属于嵌入式 Final，可它在引擎里当过所有形态的上限。单边三种形态的轮次里根本没有 Final，它们最长的一帧是 Poll，上限本该是 ${CAP.ssEmbedded}；延后的双边也一样。同样的错还有第二处：时隙长度也是按嵌入式 Final 配的，于是一个单边轮次被要求准备 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs 的时隙，去装一帧它根本不发的帧。改法不是换一个更大的常数，而是把常数换成一个函数——问一问这一轮里最长的那一帧是哪一帧。` },
  ],
  limits: [
    { kind: 'out-of-scope', text: '本仿真器没有任何一条空口消息能启停或重配一次测距会话（标准 §10.29.6.2 那一节里控制的那一半）：Final 带不带时间是 model/scenario.ts 里 UwbSessionCfg 的一个字段，场景写死，整场仿真不变。所以本课能回答「延后之后谁手里有距离」，不能回答「两台设备怎么走到延后这一种上」；真实部署里那是会话建立时的事，而这里没有会话建立。' },
    { kind: 'unmodelled', text: '两端不商量这件事。真实设备可以用 RRTN IE 提出自己希望的回复时延、由对方接受或另议，本仿真器里没有这个信息单元，src/uwb/frames.ts 的帧类型表里也没有一种帧承载它。于是两端配置不一致这种情形在这里既不会被发现也不会被纠正：锚点会去 Final 里找两个不存在的数，然后什么都不算——而时间轴上不会有任何一行说明为什么。' },
    { kind: 'unmodelled', text: '本仿真器的设备总是精确命中它被排定的那一刻：时隙边界由 session.ts 的 slotStartNs 算出，设备就在那一纳秒发射，所以四个时间只带接收戳那一点噪声（而本课连那点噪声也调成了零）。真实射频的收发转换、中断与排程都会让发送时刻抖动，这个抖动直接进入那段等待，而那段等待错 1 ns 就是约 15 cm 的距离误差。双边测距对它比单边宽容，因为两个乘积会抵消掉一部分，但抵消不掉的那部分仍然整个加进距离里。' },
    { kind: 'model-value', text: `这一课每一个字节数都是本仿真器自己的算术：RMI 表头 ${RMI_FINAL_FIXED_BYTES} 字节、嵌入式每响应方 ${RMI_FINAL_ENTRY_BYTES} 字节、延后每响应方 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节、每段回复时延一节 ${RRTI_IE_BYTES} 字节（uwb/phy.ts 里那几个常量）。标准给的是字段清单，不是字段宽度。所以「每锚点 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 字节对每锚点 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节」以及由它推出的 ${CAP.dsEmbedded} 与 ${CAP.dsDeferred} 这两个上限，都随这些取值而定——换一种编址或另一种编码，两个上限都要重算。方向不会变：延后的 Final 每锚点长得比 Poll 慢，所以上限一定落在 Poll 那一边。` },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.6.6 与 §10.29.6.7 是双边双向测距的两种时间信息形态——延后与嵌入；§10.29.1.2.4 给出它的计算式与用到的四个时间；§10.29.8.4 定义写这些时间段的那个信息单元，§10.29.8.1 定义写单段回复时延的那个；一帧最长 127 字节的 PSDU 由 §16.2.7 的物理头长度字段决定。这一课完全不依赖任何草案。',
    '本仿真器自己的模型取值有三类：2 ms 的测距时隙（来自 FiRa 的缺省配置，不是标准正文）、时隙末尾 200 ns 的飞行守卫，以及本课那张字节表所依据的各字段宽度（帧头 9、RMI 表头 3、嵌入式每响应方 6、延后每响应方 2、每段回复时延 6、帧校验 2）。锚点上限与最短时隙都是从这些宽度算出来的，不是标准给的数。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都调成零，两端之间也没有墙，所以两种形态的读数可以逐位比较。噪声打开后的散布在讲两只钟的那两课里量过。',
  ],
  scenario: () => uwbDeferredDsScenario('deferred'),
  variants: [
    { label: '嵌入：Final 把两个时间带给锚点', scenario: () => uwbDeferredDsScenario('embedded') },
  ],
  jumps: [
    J('Poll 离开手机', firstUwbPoll),
    J(`Final：只剩 ${BYTES.finalDeferredOne} 字节的一份名单`, firstUwbFinal),
    J('锚点的报告', firstUwbReport),
    J('测距行：只有手机这一条', firstUwbRange),
  ],
  observe: [
    `Final 在 4 ms 处发出，${BYTES.finalDeferredOne} 字节。载入「嵌入」再看同一帧：${BYTES.finalEmbeddedOne} 字节——多出来的 ${BYTES.finalEmbeddedOne - BYTES.finalDeferredOne} 个字节是一个锚点的短地址、它的往返时间，和标签自己那段等待。`,
    `整轮那一行两种形态都写着 "${uwbSlotsPerTag('ds', 1)} slots"：延后没有省下任何一个时隙，省下的只有字节。`,
    `本轮只有一条测距行，在 ${FIG.tagRangeUs} ms、手机那条泳道上。载入「嵌入」，锚点那条泳道会在 ${FIG.anchorRangeUs} ms 多出一条，数值与手机那条完全相同。`,
  ],
  tryThis: [
    `载入「嵌入：Final 把两个时间带给锚点」，在帧检视面板里打开 Final：一份 RMI 里列着这个锚点的短地址与往返时间，后面还有一节装着标签自己那段等待。回到延后那一轮再打开同一帧：只剩短地址。这 ${BYTES.finalEmbeddedOne - BYTES.finalDeferredOne} 个字节的差，就是锚点那条测距行的全部代价。`,
    `在编辑器里把锚点加到十个，仍用嵌入形态：场景会被拒，因为 Final 要 ${uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')} 字节而一帧只装得下 ${BYTES.psdu}。把 Final 改成延后，同样十个锚点就通过了——${CAP.dsDeferred} 个以内都通得过。`,
  ],
  quiz: [
    {
      q: '延后的 Final 里还留着一份响应方名单。为什么不能连它一起省掉？',
      options: [
        '标准规定每一帧都必须带收件人列表',
        '锚点要靠它知道自己上一帧有没有被听见，那决定它该不该在报告相位里开口',
        '名单是校验用的，少了这一帧就过不了帧校验',
      ],
      answer: 1,
      explain: '引擎里那个判据叫 finalListedMe。没有名单，Response 丢掉了的锚点也会开口，报出一段配不上任何往返时间的数。',
    },
    {
      q: `为什么嵌入形态的锚点上限是 ${CAP.dsEmbedded}，延后却是 ${CAP.dsDeferred}？`,
      options: [
        '延后的一轮时隙更少，所以一个块里装得下更多锚点',
        `上限由轮里最长那一帧决定：嵌入式 Final 每锚点长 ${RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES} 字节，延后的只长 ${RMI_FINAL_DEFERRED_ENTRY_BYTES} 字节，于是换成 Poll 卡着它`,
        '延后形态放宽了对 PSDU 长度的要求',
      ],
      answer: 1,
      explain: `上限是算出来的：最长的一帧还塞得进 ${BYTES.psdu} 字节的最大锚点数。换的不是规则，是哪一帧最长。`,
    },
    {
      q: '五种测距形态里，为什么只有 DS-TWR 嵌入这一种两端都拿到距离？',
      options: [
        '因为它是唯一一种做两次往返的',
        '因为只有它的 Final 把标签量的那两个时间带给了锚点',
        '因为只有它的报告是双向的',
      ],
      answer: 1,
      explain: '两次往返是必要的，但不够——把那两个时间从 Final 里拿掉，四个时间就只在标签手里，锚点退成一个应答器。',
    },
  ],
}
