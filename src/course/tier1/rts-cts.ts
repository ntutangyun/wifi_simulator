/**
 * Wi-Fi Tier 1 · M5 · 听不见的邻居与损失 · the access point asks out loud for you.
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
  title: 'RTS/CTS：让接收方替你预约信道',
  why: '听不见彼此的两台站点（station, STA）商量不出先后，可屋里有一台设备两边都听得见——走廊上的接入点（access point, AP）。于是办法是：长帧之前先向它发一个请求发送（request to send, RTS），让它回一个允许发送（clear to send, CTS）。这个回答传得到的地方，恰恰是提问传不到的那些地方。',
  outcomes: [
    '解释 RTS 与 CTS 这两个小帧，怎么保护得住一个长帧',
    '说清真正起作用的是接收方的回答，而不是发送方的提问',
    '对比同一场景在关闭与开启该交互时的碰撞次数，并说出代价',
  ],
  needs: ['hidden'],
  terms: [
    { term: 'RTS', plain: '请求发送：长帧之前先发的一个很小的帧，向接收方请求一段空口时间' },
    { term: 'CTS', plain: '允许发送：接收方回的那个很小的帧，表示“可以”，凡是接收方够得到的人都听得见' },
    { term: 'RTS threshold', plain: '一个帧长门限，超过它的帧要先发一次 RTS，而不是直接就发' },
  ],
  picture: [
    { heading: '起作用的是那个回答', text: '提问只传得到发送方本来就能到达的那些站点，对收不到它的站点毫无作用。起作用的是接入点回的那一帧：它从走廊发出，两个房间都收得到，而且带着一个覆盖本次交互剩余部分的 Duration。收到一帧不是发给自己的站点，都照这个数装上一只倒计时——网络分配向量（network allocation vector, NAV）——于是那台隐藏的站点（hidden station）整段时间都安静下来。真正的数据帧（data frame）和末尾的确认帧（acknowledgement, ACK）都跑在这段预约里。' },
    { kind: 'watch', jump: 0, heading: '先看它要省下什么', text: '载入仿真，跳到第一次碰撞：两个 1528 字节的帧同时失败。这就是这一课要在发送之前避开的那笔损失。' },
    {
      kind: 'diagram', heading: '一次受保护的交互，谁对谁说了什么',
      spec: rtsCtsSequence(),
      caption: '虚线是关键：提问到 Hidden B 处只有 −83.4 dBm，什么也没发生；回答到那里有 −60.6 dBm，于是它在 13 上冻结，预约挂到 1214 µs——正是确认帧结束的那一微秒。',
    },
    { kind: 'watch', heading: '看预约落进另一个房间', text: '切到受保护的那个变体，按播放。盯着远端站点的泳道：一个与它毫无关系的回答传了过来，它下方随即出现一条预约，管到这次交互结束。' },
    { heading: '现在相撞的是 RTS', text: '两台隐藏站点还是可能同时发出 RTS，那时相撞的是两个 RTS——二十字节，而不是一千多字节的一整轮。这就是其中的权衡：每个长帧都要为这一问一答付出代价，而剩下那些失败的代价都很小。从多大的帧开始付这个代价，由 RTS 门限（RTS threshold）决定。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样的 300 ms，关与开', head: [
      '300 ms 内的统计', '关', '开',
    ], rows: [
      ['碰撞次数', '126', '32'],
      ['其中撞上数据帧的', '126', '7'],
      ['成功送达的数据帧', '45', '329'],
    ] },
    { heading: 'RTS/CTS 的成本与收益', text: '撞上数据帧的碰撞少了约 94%。代价是每个长帧开始之前先发一个 20 字节的提问和一个 14 字节的回答——而房间送达的帧数是原来的七倍。' },
    { kind: 'steps', heading: '一次受保护的交互，一步一步', items: [
      '站点先把要发的那一帧加起来：载荷（payload）、24 字节帧头（MAC header）、4 字节校验。总数高过 RTS 门限——变体里是 500 字节——就先发一个 RTS。',
      '这句提问是一个 20 字节的 RTS，发给接入点。它的 Duration 预约下三个短间隔、那个回答、那一帧数据和确认，自 RTS 结束起算。',
      '这句提问只有听得见这台站点的电台才收得到。它穿过房子到对面时已低于 −82 dBm，于是另一个房间什么也没听见，照旧往下数。',
      '隔 16 µs 之后，接入点回一个 14 字节的 CTS。它的 Duration 是 RTS 讨要的那段减去这个间隔、再减去 CTS 自己。回答从走廊发出，两头的房间都听得见。',
      '站点收到不是发给自己的帧，就拿这一帧的结束时刻加上帧里的 Duration，把 NAV 设到那里——只要它比手上的更晚。远端于是把计数器就地冻住。',
      '数据帧与确认帧都跑在这段预约里，而预约到期的那一微秒正是确认帧结束的那一微秒。远端等满一个分布式帧间间隔（DCF interframe space, DIFS），从冻结时那个数接着数。',
    ] },
    { kind: 'table', heading: '718 µs 那次交互，逐个数值走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['Hidden A 手上那一帧', '1500 + 24 + 4 = 1528 B'],
      ['与门限一比，发问于', '718 µs · RTS · 20 B'],
      ['预约多久，自 RTS 结束起算', '3 × 16 + 28 + 364 + 28 = 468 µs'],
      ['提问到 Hidden B 处', '−83.4 dBm < −82 dBm ✗'],
      ['接入点回答于', '762 µs · CTS · 14 B'],
      ['它的 Duration', '468 − 16 − 28 = 424 µs'],
      ['回答到 Hidden B 处', '−60.6 dBm > −82 dBm ✓'],
      ['Hidden B 在 13 冻结，预约到', '790 + 424 = 1214 µs'],
      ['确认帧结束于', '1214 µs'],
      ['Hidden B 等一个 DIFS，接着数', '1248 µs · 13'],
    ] },
  ],
  deeper: [
    { heading: '治不掉的那几次碰撞', text: '受保护那一轮剩下的 32 次碰撞里，25 次是 RTS 撞上 RTS：两台隐藏站点的计数器，在相隔不到四个时隙的时间里先后归零。一个 RTS 只有二十字节，所以这种碰撞的代价，只是一个数据帧失败的很小一部分。另外 7 次确实撞上了数据帧——有人发出 RTS 时，那一帧其实已经在路上了。这套办法并没有让介质变安全，它只是让不安全的时刻变短。' },
    { heading: '哪些帧需要先发 RTS', text: '该变体把 RTS 门限设在 500 字节，而本场景里每个数据帧都是 1528 字节，所以它们全都要先发一个 RTS。未受保护的那个场景，就是同一个场景把门限留在 3000——高过屋里任何一帧，于是谁也不会发 RTS。反过来把门限调得极低，则连 CTS 自己都要先发一个 RTS 了——这正是门限总要远高于短帧长度的原因。' },
  ],
  limits: [
    { kind: 'threshold', text: '那条虚线之所以每次都一样干净，是因为判忙是一道硬线而电平又是定数：提问到远端 −83.4 dBm，比 −82 dBm 低 1.4 dB，于是「提问传不到、回答传得到」次次成立。在编辑器里打开衰落，这 1.4 dB 会被反复跨过，保护时而多余时而失效——真实房间里 RTS/CTS 的收益远没有 94 % 这么稳。' },
    { kind: 'model-value', text: '500 B 与 3000 B 这两个门限都是场景直接给的参数（Scenario.rtsThresholdBytes），标准把 dot11RTSThreshold 留给实现。真实驱动多半按帧长、最近的重试历史、甚至邻居的密度动态开关保护，所以「关」与「开」在真实设备上不是一个开关，而是一条随负载移动的边界。' },
    { kind: 'model-value', text: 'RTS 与 CTS 在这里走的是「不超过本帧参考速率的最高强制速率」那条规则（mac.ts 的 rtsRate 用 ctrlRespRateForMode），于是恒为 24 Mb/s、恒为 28 µs。标准只要求 RTS 取自本网络的基本速率集，真实设备常把保护帧压到最低的那一档发，好让更远的站点也收得到——那会让这笔开销明显更高，而收益也更大。' },
    { kind: 'out-of-scope', text: '这套保护只覆盖一张网内部的一次交互：引擎一个场景只有一个接入点，所以「邻居网络的 CTS 让你在整段时间里不能发送」这种跨网络的预约跑不出来。真实住宅里 RTS/CTS 的很大一部分成本正是被邻居网络占去的，而本课没有计入这一项。' },
    { kind: 'unmodelled', text: '预约到期那一纳秒就是确认帧结束那一纳秒，245 条一次不差：Duration 是发送端按引擎自己的空口时间算出来的，而全场的时钟同步到纳秒。真实设备算出的 Duration 以微秒为单位、要向上取整，接收端的倒计时又跑在自己偏差的时钟上，所以预约总会略微长出或短掉一点——那一点就是保护真正的安全余量。' },
  ],
  sources: [
    'RTS/CTS 交互，以及“收到其中任何一帧的站点都要按该帧的 Duration 设置 NAV”这条规则，见 IEEE Std 802.11-2024 的 §10.3.2.9 与 §10.3.2.4。',
    'Duration 字段及其含义——从当前帧结束起算、以微秒计的一段时间——见 §9.2.4.2；dot11RTSThreshold 属性见附录 C。',
    '本仿真器把 −82 dBm 以下判为“检测不到”，两堵砖墙及其损耗，以及上面每一个计数和时刻，都是模型取值，靠场景的随机种子即可复现，并非取自标准正文。',
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
    '受保护变体：接入点一回答，另一个房间的站点就显示出一条一直管到交互结束的预约——300 ms 里有 245 条。',
  ],
  tryThis: [
    '分别统计两个变体每 100 ms 的碰撞刻度（检视器 → BSS 总览）：关闭时约 42 次，开启时约 11 次。',
  ],
  quiz: [
    {
      q: '真正起作用的为什么是接收方的回答，而不是发送方的提问？',
      options: [
        '它用更大的功率发送',
        '它出自接入点，两台隐藏站点都听得见，而它的 Duration 覆盖了尚未开始的那段交互',
        '它更短，所以不容易被撞上',
      ],
      answer: 1,
      explain: '提问只传得到发送方本来就能到达的站点；回答传得到的，恰恰是发送方到不了的那些——而危险正藏在那里。',
    },
    {
      q: '门限从 3000 字节调到 500 字节，屋里发生了什么？',
      options: [
        '什么也不变，帧还是 1528 字节',
        '每一帧都先问一句，撞上数据帧的碰撞从 126 次降到 7 次',
        '短帧也要先问一句，开销翻倍',
      ],
      answer: 1,
      explain: '门限比帧长小，每一帧就都要先发一次 RTS/CTS，这就是它的开销。',
    },
  ],
}
