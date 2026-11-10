/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · the three ways of announcing, and CF-End.
 *
 * The second half of `txop-protect`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8). The
 * parent owns the announcement that covers a whole burst and what it buys; this
 * lesson owns the three named ways of writing it down — single, boundary,
 * multiple — the frame that hands unused time back, and the cheap announcement
 * that is useless in this house.
 *
 * The scene is the parent's, unchanged and undivided, and so are both variants —
 * the kit asserts the two variant lists are equal scenario for scenario
 * (`sameSceneAs: 'txop-protect'`), so the recorded hashes of this id are copies
 * of the parent's rather than new runs. It takes jumps 1 and 2 of the old list
 * (the first CF-End, the first one repeated by the access point); the parent
 * keeps the first RTS and the first collision.
 *
 * The procedure is the engine's own, in its order: `startExchange` in
 * src/engine/mac.ts (the `prot !== 'single'` branch that plans the burst and sets
 * `announcedEndNs`), `buildDataFrame` (§9.2.5.2: a data frame carries the TXOP
 * remainder only under `multiple`, and only while that remainder exceeds
 * SIFS + the response), and `releaseTxop` (CF-End only when the announcement
 * outruns the burst by more than SIFS + CF-End + one slot), with `onCfEnd` for
 * the access point's repeat and the NAV that is cleared by either copy.
 *
 * Every number quoted below is pinned in tests/course/protect-policies.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstCfEnd, firstCfEndRelay, J } from '../lessonKit'

/**
 * How far each policy's announcement reaches, on the run's own burst at
 * 0.736 ms, with that RTS as the zero point.
 *
 * Every span is a record or the engine's own arithmetic over one:
 *  - 这一串 — the RTS at 0–28, the CTS at 44–72, and the five exchanges from the
 *    first data frame at 88 to the last answer ending at 2 152.
 *  - 单次 — 416 µs from the moment the answer ends, which is what a CTS carries
 *    for one exchange of a 356 µs frame (2 × SIFS + 356 + 28) and what the
 *    single-protection run really prints in that field.
 *  - 边界 — the 2 456 µs the CTS carries here, from 72 to 2 528.
 *  - CF-End — the holder's copy at 2 168, the access point's at 2 212, and the
 *    hidden station's NAV_CLEAR at 2 240, which is 288 µs before the
 *    announcement would have expired.
 */
export function policyReachTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '这一串', spans: [
        { fromUs: 0, toUs: 28, label: 'RTS' },
        { fromUs: 44, toUs: 72, label: 'CTS' },
        { fromUs: 88, toUs: 2152, label: '五次交互', tone: 'accent' },
      ] },
      { label: '单次罩住', spans: [{ fromUs: 72, toUs: 488, label: '416 µs' }] },
      { label: '边界罩住', spans: [{ fromUs: 72, toUs: 2528, label: '2 456 µs', tone: 'accent' }] },
      { label: '释放', spans: [{ fromUs: 2168, toUs: 2240, label: '两份 CF-End' }] },
    ],
    axis: { fromUs: 0, toUs: 2600, ticks: [0, 500, 1000, 1500, 2000], unit: 'µs（0 是那一帧 RTS）' },
  }
}

export const protectPolicies: Lesson = {
  id: 'protect-policies',
  module: 7,
  title: '三种预告方式，以及提前释放剩余时间',
  why: '上一课的那一帧应答预告了整串帧的时长，但“预告多长时间”其实有三种方式，标准分别为它们命名。单次保护（single protection）只预告当前这一次交互，远端站点（station, STA）的预约在这一串的中途就到期；边界保护（boundary protection）由起始的请求与应答两帧把预约一直延伸到本轮末尾；多重保护（multiple protection）在此之外让每个数据帧（data frame）也写上剩余时间，使错过起始那帧应答的站点能从数据帧中重新设置预约。在这间走廊房子里，边界保护比单次保护的碰撞少一半以上，送达的帧接近三倍；多重保护与边界保护的运行结果完全相同，因为唯一收不到持有者的那台站点，恰好能收到接入点（access point, AP）的应答。预告的时间通常比这一串实际需要的更长——队列（queue）已空，或者剩余时间已经容纳不下下一帧——于是持有者发送一帧只有几个字节的 CF-End（contention-free end），收到的站点立即取消预约；远处那个房间收不到持有者，接入点就代它再发送一遍。把允许发送（clear to send, CTS）那一帧发给自己的 CTS-to-self（CTS to self）省去了前面那一帧请求，但它的传播范围和持有者的其他帧一样，到达不了远处那个房间，在这里起不到任何保护作用。',
  outcomes: [
    '说明三种预告方式各自预告到何时为止，以及它们在本场景中的运行结果',
    '解释 CF-End（contention-free end）的作用，以及为什么接入点（access point, AP）要把它再发送一遍',
    '说明 CTS-to-self（CTS to self）节省了什么，以及它在这间房子里为什么不起作用',
  ],
  needs: ['txop-protect'],
  terms: [
    { term: 'CF-End', plain: '只有几个字节的一帧，表示“本轮提前结束”：收到它的站点立即取消这段预约' },
    { term: 'CTS-to-self', plain: '站点把“允许发送”那一帧发往自己的地址：不经过请求，直接完成预告' },
  ],
  picture: [
    { kind: 'list', heading: '预告的三种方式', items: [
      '单次保护（single protection）：除了当前这一次交互，不预告任何其他时间。远端站点（station, STA）一次只被告知一次交互，预约到期后就继续倒数，进入这一串剩余的部分。',
      '边界保护（boundary protection）：开头的一次请求与应答——请求发送（request to send, RTS）与允许发送（clear to send, CTS）——把这一串预告到本轮末尾为止。本课的基础场景载入的就是这一种。',
      '多重保护（multiple protection）：开头同样是 RTS/CTS 交互，而且每个数据帧（data frame）都携带剩余时间，于是错过那帧 CTS 的站点，也能从数据帧中重新设置预约。',
    ] },
    { heading: '提前释放剩余时间', text: '覆盖整串的预告，通常比这串帧实际需要的更长。于是持有者用一帧只有几个字节的帧释放剩余的时间，表示“本轮提前结束”——这就是 CF-End。收到它的站点立即取消预约。但远处那个房间收不到持有者——于是接入点代它把这个 CF-End 再发送一遍。这和上一课接入点回复 CTS 是同一种做法，只是作用相反。' },
    { kind: 'watch', jump: 0, heading: '看一条预约提前结束', text: '载入仿真，跳到第一个 CF-End（约 2.90 ms）。五次交互之后，预约还剩 376 µs，不足以再发送一帧及其确认，于是持有者发出 CF-End；紧接着的那一帧是接入点重复发送的同一帧。观察远端站点的泳道：它那条紫色条在 2.976 ms 结束，而不是等到预告的 3.264 ms。' },
    { heading: '无需对方应答时', text: '有时持有者只需要预告，而不需要那次 RTS/CTS 交互。它可以把那一帧“允许发送”直接发往自己的地址：这就是 CTS-to-self，原来两帧，现在一帧。开销减少一半——而它的传播范围和持有者发出的其他帧完全相同，也就是说，到达不了远处那个房间。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '同一串帧，三种方式各罩住多长',
      spec: policyReachTiming(),
      caption: '零点取本轮 0.736 ms 发出的那一帧 RTS。单次保护下，那帧 CTS 只预约到第一次交互完成为止（416 µs）；边界保护预约到本轮末尾（2 456 µs），但这一串在 2 152 µs 就结束了，于是两份 CF-End 释放了最后那 288 µs。',
    },
    { kind: 'table', heading: '同样的三百毫秒，三种方式', head: [
      '300 ms 内的统计', '单次', '边界', '多重',
    ], rows: [
      ['碰撞次数', '46', '21', '21'],
      ['成功送达的数据帧', '212', '614', '614'],
      ['数据帧自己携带的 Duration，最长', '60 µs', '60 µs', '2.164 ms'],
      ['发出的 CF-End（含接入点重复的那份）', '0', '198', '198'],
    ] },
    { heading: '第三种方式多提供了什么，又没有提供什么', text: '多重保护把整个剩余时间写进每一个数据帧，本轮最长可达 2.164 ms。这间房子里没有哪台站点需要它——所有可能与它碰撞的站点都已经收到了那帧 CTS——所以它的运行结果和边界保护完全相同，碰撞次数与送达帧数都逐一相等。它针对的是另一种情形：某台站点恰好错过了起始的那帧 CTS，却能收到后面的数据帧。' },
    { kind: 'steps', heading: 'Duration 与 CF-End：引擎的计算顺序', items: [
      '一轮开始时，持有者先确定自己采用哪一种策略。若是单次保护，就只按“这一次交互”填写：一段间隔、那个应答，再加上这一帧——远端站点因此只被告知这么长的时间。',
      '若是边界或多重保护，它就先规划本轮能容纳的交互；若确实不止一次，就把起始那帧 RTS 的 Duration 写成整轮末尾减去 RTS 自身，这里是 2 500 µs，CTS 则再扣除一段间隔和它自身，写为 2 456 µs。',
      '发送数据帧时再分两种情况：多重保护下，只要“到本轮末尾的剩余时间”比“一段间隔加一个应答”更长，这一帧的 Duration 就写为那个剩余时间；否则就只写一段间隔加一个应答，也就是边界保护始终填写的那个 44 到 60 µs。',
      '本轮结束、交还信道时，如果预告的末尾比“此刻 + 一段间隔 + 一个 CF-End + 一个时隙（slot time）”更晚，持有者就发出 CF-End；接入点收到非接入点发来的 CF-End 后，间隔一段时间再重复发送一遍。',
      '任何一台解出这两份中任一份的电台，立即把自己那条预约清零；两份都没有解出的，只能一直等到预告的末尾。',
    ] },
    { kind: 'table', heading: '这一串的结束过程，逐步说明', head: [
      '步骤', '数值',
    ], rows: [
      ['预告的预约持续到', '3.264 ms'],
      ['最后一个确认落在', '2.888 ms'],
      ['已预告的预约还剩', '376 µs'],
      ['再进行一次交互需要', '416 µs ✗'],
      ['持有者的 CF-End 发于', '2.904 ms'],
      ['接入点重复的那一份发于', '2.948 ms'],
      ['于是远端站点的预约结束于', '2.976 ms'],
      ['释放的时间', '288 µs'],
    ] },
  ],
  deeper: [
    { heading: 'CTS-to-self 做不到的事', text: '把“允许发送”发往自己，省去的是那一帧 RTS；在新旧设备混杂的房间里，这部分节省是实实在在的。但在这间房子里，它起不到任何保护作用：这一帧的传播范围和持有者发出的其他帧一样，远处房间里的站点根本收不到，它的退避计数器仍然继续递减。预告的开销再低，如果在可能发生碰撞的位置收不到，就没有任何作用。' },
  ],
  limits: [
    { kind: 'model-value', text: '「接入点替非接入点的持有者把 CF-End 重复一遍」，标准是针对 S1G 接入点写明的，本引擎让所有接入点都这么做（mac.ts 的 onCfEnd）。于是那 198 帧 CF-End 里正好一半出自接入点，远端站点才能提前 288 µs 清除自己的预约。一台普通的 5 GHz 接入点并不会代为重复发送——这是本课收益最大的一处模型取值。' },
    { kind: 'unmodelled', text: '是否发送 CF-End，只取决于「预告的末尾是否比此刻加一段间隔、一个 CF-End 与一个时隙更晚」这一个算术条件（mac.ts 的 releaseTxop）：条件成立就一定发送。标准把截断定为可选，真实设备大多根本不发送，而是让其他站点等到预约结束。所以「提前释放剩余时间」在这里是默认行为，在真实空口上只有少数设备这样做。' },
    { kind: 'unmodelled', text: 'CTS-to-self 在引擎里根本没有实现：本课只能从原理上说明它在这间房子里不起作用，时间轴上找不到这样的帧（cts 只作为 RTS 的应答存在）。同样，多重保护那一列之所以和边界保护完全相同，是因为这个房间里唯一收不到持有者的那台站点恰好能收到接入点的应答——引擎能够体现两者的差别，只是本课的场景体现不出来。' },
    { kind: 'threshold', text: '一条预约要么设置、要么没有设置，因为能否解出是一道硬门限；两份 CF-End 被哪些站点收到也取决于同一道门限。真实接收机在门限附近的行为是概率性的，所以「两份都没有解出的只能等到末尾」这种明确的二分，在真实房间里是一个比例，而不是一条规则。' },
  ],
  sources: [
    'QoS 站点在单次、边界与多重保护下如何填写 Duration 字段，见 IEEE Std 802.11-2024 的 §9.2.5（尤其是 §9.2.5.2）。',
    'CF-End，以及“收到它的站点清零 NAV”这条规则，见 §10.23.2.10《TXOP 的截断》。标准是针对 S1G 接入点写明那次重复的；本仿真器让所有接入点都这么做，这是模型取值。',
    'CTS-to-self 是 §10.3.2.15 所列的 NAV 分发机制之一；标准正文明确指出它比 RTS/CTS 开销更低，但对隐藏节点更不稳健。',
    '上面每一个计数与时刻都是模型取值，靠本场景的随机种子即可复现，并非取自标准正文。',
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
    { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
  ], { rtsThresholdBytes: 500 }),
  variants: [
    {
      label: '单次保护（逐次交换）',
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
      ], { rtsThresholdBytes: 500 }),
    },
    {
      label: '多重保护（数据帧携带剩余时间）',
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
        { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('第一个 CF-End', firstCfEnd),
    J('第一个由接入点重复的 CF-End', firstCfEndRelay),
  ],
  observe: [
    '“第一个 CF-End”（≈ 2.90 ms）：五次交互之后，预约还剩 376 µs——不足以再发送一帧及其确认。A 发出 CF-End，接入点间隔一段时间后重复发送一遍，于是 B 的预约在 2.976 ms 结束，而不是 3.264 ms。整轮 300 ms 里这样的 CF-End 一共 198 帧，正好一半出自接入点。',
    '载入“多重保护”变体，悬停这一串中间的某个数据帧：它的 Duration 一直覆盖到本轮末尾，最长 2.164 ms，而边界保护下只有 44 到 60 µs。',
  ],
  tryThis: [
    '把“单次保护”和“多重保护”两个变体各运行一遍，只观察远端站点的泳道：单次保护下它那条预约在每一串的中途就到期，多重保护下它和边界保护一样一直显示紫色到末尾。计数也完全一样——21 次碰撞、送达 614 帧——因为这间房子里没有哪台站点会错过那帧 CTS。',
  ],
  quiz: [
    {
      q: '一串帧比它预告的预约提前较多就结束了。会发生什么？',
      options: [
        '不发生任何事——所有站点等到预约结束',
        '持有者发出 CF-End，接入点再重复一遍',
        '持有者再发一次 RTS',
      ],
      answer: 1,
      explain: 'CF-End 释放未使用的时间。收到任意一份的站点取消预约；两份都没收到的，只能等到预告的末尾。',
    },
    {
      q: '在这间走廊房子里，多重保护比边界保护多带来了什么？',
      options: [
        '更少的碰撞：21 次降到 12 次',
        '没有带来任何额外收益：两边的碰撞次数完全相同，因为这里没有哪台站点会错过那帧 CTS',
        '更短的预约，于是空口有更多空闲时间',
      ],
      answer: 1,
      explain: '多重保护针对的是“错过起始那帧 CTS、却能收到数据帧”的站点。这个房间里唯一收不到持有者的那台，恰好能收到接入点的 CTS。',
    },
  ],
}
