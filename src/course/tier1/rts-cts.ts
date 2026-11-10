/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · the access point asks out loud for you.
 *
 * The second half of `hidden`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M5). The
 * parent stated two rules the engine follows — what "idle" means to a radio
 * that cannot hear the other room, and the question-and-permission exchange
 * that repairs it — and this is the second: RTS, CTS, the threshold that
 * decides who pays, and what the pair buys across 300 ms.
 *
 * The scene is the parent's, unchanged and undivided (`sameSceneAs: 'hidden'`),
 * so the recorded timeline hash of this id is a copy of `hidden`'s rather than a
 * new run. The base scene never sends an RTS — `lessonShapeSuite` requires every
 * jump to occur in the BASE run — so the one jump it takes is the parent's
 * collision, which is the loss this lesson prevents, and the second `watch`
 * sends the reader to the protected variant instead of to a jump.
 *
 * Nine pins arrive here from tests/course/hidden.test.ts, asserted against the
 * same two runs they always were: the on/off table, the 94 % cut, the 20/14-byte
 * pair, the 245 reservations, the per-100 ms ticks, the six procedure steps with
 * their 718 µs round, and both `deeper` notes.
 *
 * The sequence figure replaces the blow-by-blow half of 「先问一句，让对方大声回答」:
 * who says what, in what order, and which arrow reaches the far room is the
 * picture, so the paragraph keeps only the reason the answer is what matters.
 *
 * Every number quoted below is pinned in tests/course/rts-cts.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { type Lesson, firstCollision, J } from '../lessonKit'
import { hiddenScenario } from './hidden'

/**
 * The protected round the worked table walks, to scale in order rather than in
 * time: the 718 µs question, the 762 µs answer that both end rooms hear, the
 * 424 µs it reserves, the data frame at 806 µs and the acknowledgement at
 * 1186 µs. Every instant is a record of the protected variant, and
 * `rts-cts.test.ts` reads each one back out of this spec.
 *
 * The dashed arrow is the point of the figure: the question goes nowhere near
 * the other room, and the answer does.
 */
export function rtsCtsSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-1', label: 'Hidden A' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-2', label: 'Hidden B' },
    ],
    messages: [
      { from: 'sta-1', to: 'ap', label: 'RTS 20 B', at: '718 µs', tone: 'accent' },
      { from: 'sta-1', to: 'sta-2', label: '收不到', tone: 'muted' },
      { from: 'ap', to: 'sta-1', label: 'CTS 14 B', at: '762 µs', tone: 'accent' },
      { from: 'ap', to: 'sta-2', label: '预约 424 µs', tone: 'accent' },
      { from: 'sta-1', to: 'ap', label: '数据帧', at: '806 µs' },
      { from: 'ap', to: 'sta-1', label: '确认帧', at: '1186 µs' },
    ],
  }
}

export const rtsCts: Lesson = {
  id: 'rts-cts',
  module: 4,
  title: 'RTS/CTS：由接收方代为预约信道',
  why: '相互收不到信号的两台站点（station, STA）无法协调发送顺序，但房间里有一台设备能同时收到双方的信号——走廊上的接入点（access point, AP）。因此解决方法是：发送长帧之前先向它发送一个很短的请求发送（request to send, RTS），由它回复一个允许发送（clear to send, CTS）。RTS 只能到达发送方本来就能覆盖的范围，到达对面房间时电平已低于判忙门限，不产生任何作用；起作用的是 CTS：它从走廊发出，两个房间都能收到，帧中的 Duration 覆盖随后的数据帧（data frame）和末尾的确认帧（acknowledgement, ACK），隐藏的那台站点据此设置网络分配向量（network allocation vector, NAV），计数随即冻结，预约恰好在确认帧结束的时刻到期。碰撞并没有消失：两台站点仍会同时发出 RTS，但这时损失的是二十字节的短帧，而不是一千多字节的一整轮交互；其余少数涉及数据帧的碰撞，是因为一方发出 RTS 时，对方的数据帧已经在发送。结果是涉及数据帧的碰撞几乎消失，房间送达的帧数增加到原来的七倍；代价是每个长帧之前都多一次 RTS/CTS 交换。哪些帧需要先发 RTS，由 RTS 门限（RTS threshold）决定：帧长超过门限才先发 RTS；受保护的那个变体把门限设得比房间里每一帧都短，于是每一帧都先发 RTS。',
  outcomes: [
    '解释 RTS 与 CTS 这两个短帧如何保护一个长帧',
    '说明真正起作用的是接收方的应答（CTS），而不是发送方的请求（RTS）',
    '对比同一场景在关闭与开启该交互时的碰撞次数，并说出代价',
  ],
  needs: ['hidden'],
  terms: [
    { term: 'RTS', plain: '请求发送：发送长帧之前先发出的一个短帧，向接收方申请一段空口时间' },
    { term: 'CTS', plain: '允许发送：接收方回复的短帧，表示同意发送，接收方覆盖范围内的所有站点都能收到' },
    { term: 'RTS threshold', plain: '一个帧长门限，超过它的帧要先发送一次 RTS，而不是直接发送' },
  ],
  picture: [
    { heading: '起作用的是 CTS', text: 'RTS 只能到达发送方本来就能覆盖的那些站点，对收不到它的站点没有任何作用。起作用的是接入点回复的那一帧：它从走廊发出，两个房间都能收到，而且携带一个覆盖本次交互剩余部分的 Duration。收到一帧不是发给自己的帧的站点，都据此设置一个倒计时——网络分配向量（network allocation vector, NAV）——于是那台隐藏的站点（hidden station）在整段时间内都不发送。真正的数据帧（data frame）和末尾的确认帧（acknowledgement, ACK）都在这段预约内传输。' },
    { kind: 'watch', jump: 0, heading: '先观察它要避免的损失', text: '载入仿真，跳到第一次碰撞：两个 1528 字节的帧同时失败。这就是本课要在发送之前避免的损失。' },
    {
      kind: 'diagram', heading: '一次受保护的交互中各设备发送的帧',
      spec: rtsCtsSequence(),
      caption: '虚线是关键：RTS 到达 Hidden B 处只有 −83.4 dBm，不产生任何作用；CTS 到达那里有 −60.6 dBm，于是它冻结在 13，预约持续到 1214 µs——正是确认帧结束的那一微秒。',
    },
    { kind: 'watch', heading: '观察预约在另一个房间生效', text: '切换到受保护的那个变体，点击播放。观察远端站点的泳道：一个与它无关的 CTS 到达，它下方随即出现一条预约，持续到这次交互结束。' },
    { heading: '现在发生碰撞的是 RTS', text: '两台隐藏站点仍可能同时发出 RTS，此时发生碰撞的是两个 RTS——二十字节，而不是一千多字节的一整轮交互。这就是其中的权衡：每个长帧都要为这次 RTS/CTS 交换付出开销，而其余那些失败的代价都很小。从多长的帧开始承担这项开销，由 RTS 门限（RTS threshold）决定。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样的 300 ms：关闭与开启', head: [
      '300 ms 内的统计', '关', '开',
    ], rows: [
      ['碰撞次数', '126', '32'],
      ['其中涉及数据帧的', '126', '7'],
      ['成功送达的数据帧', '45', '329'],
    ] },
    { heading: 'RTS/CTS 的成本与收益', text: '涉及数据帧的碰撞减少了约 94%。代价是每个长帧开始之前先交换一个 20 字节的 RTS 和一个 14 字节的 CTS——而房间送达的帧数是原来的七倍。' },
    { kind: 'steps', heading: '一次受保护的交互：逐步过程', items: [
      '站点先计算待发帧的总长度：载荷（payload）、24 字节帧头（MAC header）、4 字节校验。总长度超过 RTS 门限——变体中是 500 字节——就先发送一个 RTS。',
      '这个 RTS 长 20 字节，发给接入点。它的 Duration 预约三个短间隔、CTS、数据帧和确认帧，自 RTS 结束起算。',
      '只有能收到这台站点信号的电台才能收到这个 RTS。它穿过房子到达对面时已低于 −82 dBm，于是另一个房间什么也没有收到，计数照常递减。',
      '间隔 16 µs 之后，接入点回复一个 14 字节的 CTS。它的 Duration 是 RTS 所申请的时长减去这个间隔、再减去 CTS 自身的时长。CTS 从走廊发出，两端的房间都能收到。',
      '站点收到不是发给自己的帧，就以这一帧的结束时刻加上帧中的 Duration 设置 NAV——前提是它晚于当前的 NAV。远端站点于是将计数器冻结。',
      '数据帧与确认帧都在这段预约内传输，而预约到期的那一微秒正是确认帧结束的那一微秒。远端站点等待一个分布式帧间间隔（DCF interframe space, DIFS），从冻结时的值继续递减。',
    ] },
    { kind: 'table', heading: '718 µs 那次交互的逐项数值', head: [
      '步骤', '数值',
    ], rows: [
      ['Hidden A 待发的那一帧', '1500 + 24 + 4 = 1528 B'],
      ['与门限比较后，发送 RTS 于', '718 µs · RTS · 20 B'],
      ['预约时长，自 RTS 结束起算', '3 × 16 + 28 + 364 + 28 = 468 µs'],
      ['RTS 到达 Hidden B 处', '−83.4 dBm < −82 dBm ✗'],
      ['接入点回复 CTS 于', '762 µs · CTS · 14 B'],
      ['它的 Duration', '468 − 16 − 28 = 424 µs'],
      ['CTS 到达 Hidden B 处', '−60.6 dBm > −82 dBm ✓'],
      ['Hidden B 冻结在 13，预约持续到', '790 + 424 = 1214 µs'],
      ['确认帧结束于', '1214 µs'],
      ['Hidden B 等待一个 DIFS 后继续递减', '1248 µs · 13'],
    ] },
  ],
  deeper: [
    { heading: '无法消除的那几次碰撞', text: '受保护那一轮余下的 32 次碰撞中，25 次是 RTS 与 RTS 碰撞：两台隐藏站点的计数器在相隔不超过四个时隙的时间内先后归零。一个 RTS 只有二十字节，所以这种碰撞的代价只是一个数据帧失败的很小一部分。另外 7 次确实涉及数据帧——一方发出 RTS 时，那一帧实际上已经在发送。这套方法并没有消除碰撞的风险，它只是缩短了存在风险的时间。' },
    { heading: '哪些帧需要先发 RTS', text: '该变体把 RTS 门限设为 500 字节，而本场景中每个数据帧都是 1528 字节，所以它们都要先发送 RTS。未受保护的那个场景，就是同一个场景把门限保持在 3000——高于房间里任何一帧，于是没有站点会发送 RTS。反过来，若把门限调得极低，则连比 RTS 本身还短的数据帧也要先发送一个 RTS（控制帧不受门限约束，CTS 与确认帧从不需要 RTS）——这正是门限总要远高于短帧长度的原因。' },
  ],
  limits: [
    { kind: 'threshold', text: '那条虚线之所以每次结果都相同，是因为判忙是一条硬门限而电平又是定值：RTS 到达远端为 −83.4 dBm，比 −82 dBm 低 1.4 dB，于是「RTS 无法到达、CTS 能够到达」每次都成立。在编辑器里开启衰落，电平会反复越过这 1.4 dB，保护时而多余、时而失效——真实房间里 RTS/CTS 的收益远不如 94 % 这样稳定。' },
    { kind: 'model-value', text: '500 B 与 3000 B 这两个门限都是场景直接给定的参数（Scenario.rtsThresholdBytes），标准把 dot11RTSThreshold 的取值留给实现决定。真实驱动大多根据帧长、近期的重试历史，甚至邻居的密度动态开启或关闭保护，所以「关」与「开」在真实设备上不是一个固定开关，而是一条随负载变化的边界。' },
    { kind: 'model-value', text: 'RTS 与 CTS 在这里采用「不超过本帧参考速率的最高强制速率」那条规则（mac.ts 的 rtsRate 调用 ctrlRespRateForMode），因此它随数据帧的速率档位变化：本轮中 RTS 在 24、12、6 Mb/s 三档上都出现过，空口时间分别是 28、36、52 µs。标准只要求 RTS 取自本网络的基本速率集，真实设备常以最低一档速率发送保护帧，以便更远的站点也能收到——这会使这项开销明显增加，而收益也更大。' },
    { kind: 'out-of-scope', text: '这套保护只覆盖一个网络内部的一次交互：引擎中一个场景只有一个接入点，所以「邻居网络的 CTS 使本机在整段时间内不能发送」这种跨网络的预约无法复现。真实住宅中 RTS/CTS 的很大一部分开销正是由邻居网络造成的，而本课没有计入这一项。' },
    { kind: 'unmodelled', text: '预约到期的那一纳秒就是确认帧结束的那一纳秒，245 条全部如此：Duration 是发送端按引擎自身的空口时间计算的，而全场的时钟同步到纳秒。真实设备算出的 Duration 以微秒为单位、要向上取整，接收端的倒计时又依据自身存在偏差的时钟，所以预约总会略长或略短——这一点偏差就是保护实际具有的安全余量。' },
  ],
  sources: [
    'RTS/CTS 交互，以及“收到其中任何一帧的站点都要按该帧的 Duration 设置 NAV”这条规则，见 IEEE Std 802.11-2024 的 §10.3.2.9 与 §10.3.2.4。',
    'Duration 字段及其含义——从当前帧结束起算、以微秒计的一段时间——见 §9.2.4.2；dot11RTSThreshold 属性见附录 C。',
    '本仿真器把 −82 dBm 以下判为“检测不到”，两堵砖墙及其损耗，以及上面每一个计数和时刻，都是模型取值，可以通过场景的随机种子复现，并非取自标准正文。',
  ],
  scenario: () => hiddenScenario(),
  variants: [
    {
      label: '开启 RTS/CTS（门限 500 B）',
      scenario: () => hiddenScenario({ rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('第一次碰撞', firstCollision),
  ],
  observe: [
    '受保护变体：接入点一回复 CTS，另一个房间的站点就显示出一条持续到交互结束的预约——300 ms 内共有 245 条。',
  ],
  tryThis: [
    '分别统计两个变体每 100 ms 的碰撞刻度（检视器 → BSS 总览）：关闭时约 42 次，开启时约 11 次。',
  ],
  quiz: [
    {
      q: '为什么真正起作用的是接收方的应答，而不是发送方的请求？',
      options: [
        '它用更大的功率发送',
        '它由接入点发出，两台隐藏站点都能收到，而它的 Duration 覆盖了尚未开始的那段交互',
        '它更短，所以不容易发生碰撞',
      ],
      answer: 1,
      explain: '请求只能到达发送方本来就能覆盖的站点；应答能到达的，恰恰包括发送方覆盖不到的那些站点——而碰撞的风险正来自那里。',
    },
    {
      q: '门限从 3000 字节调到 500 字节，房间里发生了什么变化？',
      options: [
        '没有任何变化，帧仍是 1528 字节',
        '每一帧都先发送 RTS，涉及数据帧的碰撞从 126 次降到 7 次',
        '短帧也要先发送 RTS，开销翻倍',
      ],
      answer: 1,
      explain: '门限小于帧长，每一帧都要先进行一次 RTS/CTS 交换，这就是它的开销。',
    },
  ],
}
