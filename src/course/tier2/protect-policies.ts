/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · the ways of announcing, and CF-End.
 *
 * Standard-first shape (2026-11-11): ① IEEE Std 802.11-2024's two classes of Duration setting
 * (§9.2.5.2), TXOP truncation by CF-End and the access point's optional repeat (§10.23.2.10, the
 * CF-End frame in §9.3.1.6, the HE rule in §26.2.5), and CTS-to-self as a NAV distribution
 * mechanism (§10.3.2.15); ② what this simulator does with each; ③ three runs.
 *
 * **Two audit corrections.** The old lesson named three standard policies; §9.2.5.2 has two, and
 * the engine's `'boundary'` is its own hybrid (see txop-protect). And the old `limits` said the
 * access point's repeat of a CF-End 「is written for S1G access points」: §10.23.2.10 says, for
 * every non-DMG BSS, that an AP MAY answer a CF-End whose BSSID matches with one of its own after
 * a SIFS. The engine always does, which ② records as its choice.
 *
 * The scene is the parent's, unchanged and undivided, and so are both variants
 * (`sameSceneAs: 'txop-protect'`), so the recorded hashes of this id are copies of the parent's.
 * Jumps 0 and 1 are the first CF-End and the first one repeated by the access point.
 *
 * Every figure the labs print is read back out of this file by tests/course/protect-policies.test.ts.
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
 *  - 单次 — 416 µs from the moment the answer ends, which is what the single-policy
 *    run's CTS carries for one exchange of a 356 µs frame (2 × SIFS + 356 + 28).
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
  why: 'IEEE Std 802.11-2024 §9.2.5.2 为传输机会（transmit opportunity, TXOP）的发起方只规定了两类 Duration 设置：单次保护（single protection）每一帧只预约到下一帧及其应答，多重保护（multiple protection）可以预约到整串的预计结束，此后的每一帧至少重复一遍这个终点。本仿真器有三种策略：单次、「边界」与多重；「边界」只让开头的请求发送（request to send, RTS）按多重保护预约，不是标准的类别。在上一课的走廊户型里，多重策略与「边界」策略的运行结果完全相同：唯一收不到持有者的那台站点（station, STA）能收到接入点（access point, AP）的允许发送（clear to send, CTS），数据帧（data frame）里重复的终点它收不到，也不需要。预约通常比这一串实际用的时间长，§10.23.2.10 允许持有者发送一帧 CF-End（contention-free end）提前结束 TXOP，收到的站点把网络分配向量（network allocation vector, NAV）复位为 0；只收得到接入点的站点收不到这一帧，所以标准允许接入点在一个短帧间间隔（short interframe space, SIFS）之后再发一帧。本仿真器的接入点每次都转发，0.736 ms 那一串结束后，隐藏站点的预约因此提前 288 µs 结束。标准还有一种只发一帧的预约方式 CTS-to-self（CTS to self），开销比 RTS/CTS 低，但对隐藏站点不可靠；本仿真器的 Wi-Fi 站点没有实现它。',
  outcomes: [
    '说出标准的两类 Duration 设置，以及本仿真器的三种策略各对应什么',
    '说明 CF-End 何时可以发送、收到后怎样处理，以及接入点为什么要再发一帧',
    '在时间轴上读出一次提前释放：剩下多少预约、哪两帧 CF-End、隐藏站点何时恢复',
  ],
  needs: ['txop-protect'],
  terms: [
    { term: 'CF-End', plain: '只有 20 个八位组的控制帧，表示持有者的 TXOP 已经结束：收到它的站点把 NAV 复位为 0' },
    { term: 'CTS-to-self', plain: '接收端地址等于发送方自己地址的 CTS：不经过 RTS，直接为后面的发送预约介质' },
  ],
  standard: [
    { heading: '两类 Duration 设置（§9.2.5.2）', text: '在增强型分布式信道接入（enhanced distributed channel access, EDCA）下发起 TXOP 的站点，在发送第一帧时选定单次保护或多重保护，同一个 TXOP 里此后的帧使用同一类设置。单次保护下，不是最后一帧的数据帧覆盖确认帧（acknowledgement, ACK）、下一帧及其应答；多重保护下，TXOP 的第一帧可以预约到 TXOP 的上限，建立预约之后每一帧的 Duration 不小于已有预约的剩余时长减去本帧的时长。' },
    { heading: '提前结束 TXOP（§10.23.2.10）', text: '经 EDCA 取得信道的站点清空了发送队列（queue）时，只要剩余的时长够发一帧 CF-End，就可以发送 CF-End，明确表示它的 TXOP 已经结束；图 10-32 的例子是持有者已经没有能在 TXOP 上限（TXOP limit）内发完的数据。发出 CF-End 的持有者在本 TXOP 内不得再发起任何帧交换；不是持有者的非接入点站点不得发送 CF-End。' },
    { heading: 'CF-End 帧与收到后的处理（§9.3.1.6，§10.23.2.10，§26.2.5）', text: 'CF-End 由帧控制（Frame Control）、Duration、接收端地址（receiver address, RA）、基本服务集标识（basic service set identifier, BSSID）与帧校验序列（frame check sequence, FCS）组成，共 20 个八位组；非 DMG、非 S1G 站点发出时 Duration 为 0，接收端地址为广播地址。非 HE 站点收到 CF-End，在这个 PPDU（PHY protocol data unit）结束时把 NAV 复位为 0。维护两个 NAV 的 HE 站点，收到本基本服务集（basic service set, BSS）的 CF-End 时复位 BSS 内的那个 NAV（§26.2.5）。' },
    { heading: '接入点再发一帧（§10.23.2.10）', text: '接入点收到 BSSID 与自己相同的 CF-End 后，可以在一个 SIFS 之后发出一帧 CF-End。标准的 NOTE 指出原因：持有者的一帧 CF-End 只复位收得到持有者的站点；收得到应答方、为它设置了 NAV 的站点可能收不到这一帧，只能等原来的预约到期。' },
    { heading: 'CTS-to-self（§10.3.2.15，§9.2.5.2 a)3)）', text: '站点需要分发 NAV 时，可以先发一帧接收端地址等于自己地址的 CTS，即 CTS-to-self，它的 Duration 覆盖待发的帧、一个 SIFS 与应答帧，再加一个 SIFS。标准指出，CTS-to-self 的开销比 RTS/CTS 低，但对隐藏节点（hidden station）和碰撞不如 RTS/CTS 可靠，出错时站点宜改用更可靠的机制。' },
    { kind: 'steps', heading: '一个提前结束的 TXOP，按标准：逐步说明', items: [
      '持有者用 RTS/CTS 开启 TXOP，CTS 把预约转述给只收得到接入点的站点（§9.2.5.6）。',
      '持有者发完能在上限内发完的帧，预约还剩下一段（§10.23.2.9）。',
      '剩余的时长够发一帧 CF-End，持有者发出 CF-End，此后本 TXOP 内不再发起交换（§10.23.2.10）。',
      '收得到持有者的站点在这一帧结束时把 NAV 复位为 0（§10.23.2.10）。',
      '接入点可以在一个 SIFS 之后再发一帧 CF-End，只收得到接入点的站点由此复位 NAV；两帧都收不到的站点等到原来的预约到期（§10.23.2.10 NOTE 1）。',
    ] },
  ],
  implementation: [
    { topic: '三种策略', standard: '只有单次保护与多重保护两类（§9.2.5.2）', sim: '每台站点由场景固定一种策略：单次、「边界」或多重。「边界」让开头的 RTS 预约到 TXOP 末尾，此后的数据帧只覆盖自己的确认帧，不是标准的类别。', kind: 'differs' },
    { topic: '单次策略的数据帧', standard: '不是最后一帧时还覆盖下一帧及其应答（§9.2.5.2 a)8)）', sim: '每个数据帧只覆盖一个 SIFS 与自己的确认帧，与「边界」策略相同。', kind: 'differs' },
    { topic: '多重保护下数据帧的 Duration', standard: '不小于已有预约的剩余时长减本帧，不大于 TXOP 剩余时长减本帧（§9.2.5.2 b)）', sim: '取下限：写到 RTS 预约的终点；到终点的剩余时间不比「SIFS 加应答帧」长时，只写 SIFS 加应答帧。', kind: 'value' },
    { topic: '确认帧的 Duration', standard: '引出它的那一帧的 Duration 减去 SIFS 与确认帧（§9.2.5.6）', sim: '一律写 0：多重策略下数据帧带着剩余时间，接入点的确认帧也不转述。', kind: 'differs' },
    { topic: '何时发送 CF-End', standard: '清空发送队列、剩余时长够发一帧 CF-End 时可以发送（§10.23.2.10）', sim: '只要这个 TXOP 用 RTS 预约到了末尾，结束时预约的终点晚于「此刻 + SIFS + 一帧 CF-End + 一个时隙（slot time）」，就一定发送，不论队列是否已空。本课的站点一直有数据待发，每一次都是因为下一次交互放不进上限。', kind: 'choice' },
    { topic: 'CF-End 帧', standard: '20 个八位组，Duration 为 0，接收端地址为广播地址（§9.3.1.6）', sim: '照此。本仿真器没有基本速率集，CF-End 固定以 24 Mb/s 发送，空口时间（airtime）28 µs。', kind: 'faithful' },
    { topic: '发出 CF-End 之后', standard: '持有者在本 TXOP 内不再发起帧交换（§10.23.2.10）', sim: '照此：先结束 TXOP，再发 CF-End，之后重新退避（backoff）。', kind: 'faithful' },
    { topic: '收到 CF-End', standard: '非 HE 站点在 PPDU 结束时把 NAV 复位为 0；HE 站点按 §26.2.5 区分 BSS 内外的 NAV', sim: '每台站点只有一个 NAV，收到即清零。本课的两台站点不是 HE 站点，场景里也只有一个 BSS，结果与标准相同。', kind: 'faithful' },
    { topic: '接入点再发一帧', standard: '接入点可以在一个 SIFS 之后回发一帧 CF-End（§10.23.2.10）', sim: '接入点收到别的站点发来的 CF-End，只要自己不在一次交互之中，每次都在一个 SIFS 之后回发。', kind: 'choice' },
    { topic: 'CTS-to-self', standard: '分发 NAV 的一种机制（§10.3.2.15）', sim: 'Wi-Fi 站点未实现：时间轴上的 CTS 只作为 RTS 的应答出现。本仿真器里只有环境供能（AMP）的接入点使用 CTS-to-self。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一条预约提前结束',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个 CF-End。',
        '读出这一串的最后一个确认帧、两帧 CF-End 的发送者与时刻，以及隐藏站 B 的 NAV 在何时清零。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '同一串帧，三种策略各罩住多长',
          spec: policyReachTiming(),
          caption: '零点取本轮 0.736 ms 发出的那一帧 RTS。单次策略下，CTS 只预约到第一次交互完成为止（416 µs）；「边界」策略预约到 TXOP 末尾（2 456 µs），但这一串在 2 152 µs 就结束了，于是两帧 CF-End 释放了最后那 288 µs。',
        },
        { kind: 'table', heading: '0.736 ms 那一串的结束过程，逐项数值', head: ['步骤', '数值'], rows: [
          ['隐藏站 B 的预约持续到', '3.264 ms'],
          ['最后一个确认帧结束于', '2.888 ms'],
          ['预约还剩', '376 µs'],
          ['再进行一次交互需要', '416 µs'],
          ['持有者的 CF-End 发于', '2.904 ms'],
          ['接入点的 CF-End 发于', '2.948 ms'],
          ['隐藏站 B 的 NAV 清零于', '2.976 ms'],
          ['提前释放的时间', '288 µs'],
        ] },
      ],
      expect: '最后一个确认帧在 2.888 ms 结束，预约还剩 376 µs，不够再进行一次 416 µs 的交互；A 在 2.904 ms 发出 CF-End，接入点在 2.948 ms 再发一帧，B 在 2.976 ms 清零 NAV，比预约的 3.264 ms 早 288 µs。',
      meaning: 'B 收不到 A，它清零靠的是接入点那一帧，这正是 §10.23.2.10 NOTE 1 说的情况（①）。接入点每次都转发、持有者在放不进下一次交互时就发 CF-End，是本仿真器的取法（②）。',
    },
    {
      heading: '接入点转发了多少',
      jump: 1,
      steps: [
        '跳到第一个由接入点发出的 CF-End，再运行满 300 ms。',
        '统计 CF-End 的总数与其中接入点发出的帧数，并载入「单次保护（逐次交换）」比较。',
      ],
      expect: '300 ms 内共有 198 帧 CF-End，其中 99 帧由接入点发出，每一帧 A 或 B 的 CF-End 后面都跟着接入点的一帧；单次变体里一帧 CF-End 也没有，因为它的 RTS 从不预约到 TXOP 末尾，结束时没有剩余的预约可释放。',
      meaning: '本仿真器只在预约到 TXOP 末尾之后才发 CF-End（② 何时发送 CF-End）；接入点的转发对每一帧都发生（② 接入点再发一帧）。',
    },
    {
      heading: '多重策略与「边界」策略',
      variant: 1,
      steps: [
        '载入「多重保护（数据帧携带剩余时间）」，悬停 0.736 ms 那一串里的数据帧，读出它们的 Duration。',
        '运行 300 ms，与本课场景、单次变体对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的 300 ms，三种策略', head: ['300 ms 内的统计', '单次', '边界', '多重'], rows: [
          ['碰撞次数', '46', '21', '21'],
          ['成功送达的数据帧', '212', '614', '614'],
          ['数据帧自己携带的 Duration，最长', '60 µs', '60 µs', '2.164 ms'],
          ['发出的 CF-End（含接入点转发的）', '0', '198', '198'],
        ] },
      ],
      expect: '多重策略下，0.736 ms 那一串的五个数据帧依次写 2 084、1 668、1 252、836、420 µs，每一个都写到 3.264 ms；接入点的确认帧仍然写 0。碰撞、送达与 CF-End 的计数与「边界」策略逐一相同；「边界」与单次策略下数据帧只写 44 到 60 µs。',
      meaning: '多重策略的数据帧照 §9.2.5.2 b) 重复预约的终点（②）。在这间房子里没有哪台站点需要它：唯一收不到 A 的 B 收得到接入点的 CTS，而 B 收不到 A 的数据帧（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§9.2.5.2（单次保护与多重保护两类 Duration 设置）、§9.2.5.6（应答帧的 Duration）、§10.23.2.10 与图 10-32（TXOP 的提前结束、CF-End 的发送与接收、接入点可以回发一帧 CF-End，NOTE 1）、§9.3.1.6 与图 9-45（CF-End 帧的格式与 Duration）、§26.2.5（HE 站点收到 CF-End）、§10.3.2.15（CTS-to-self 作为 NAV 分发机制，开销与可靠性）。',
    '本仿真器的取值与取法：三种保护策略（其中「边界」不是标准的类别）、多重策略取 Duration 的下限、确认帧写 0、CF-End 的发送条件与固定的 24 Mb/s、接入点每次转发。上面每一个计数与时刻都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一串帧比它预告的预约提前较多就结束了。按标准，持有者可以怎样做？',
      options: [
        '什么也不能做，所有站点必须等到预约结束',
        '剩余时长够发一帧 CF-End 时，发出 CF-End；接入点可以再发一帧',
        '再发一次 RTS，把 Duration 写成 0',
      ],
      answer: 1,
      explain: '§10.23.2.10 允许持有者用 CF-End 结束 TXOP，收到的站点复位 NAV；接入点可以在一个 SIFS 之后回发一帧，让只收得到接入点的站点也复位。',
    },
    {
      q: '在这间走廊房子里，多重策略比「边界」策略多带来了什么？',
      options: [
        '更少的碰撞：21 次降到 12 次',
        '没有带来任何额外收益：碰撞次数与送达帧数完全相同，因为唯一收不到持有者的站点收得到接入点的 CTS',
        '更短的预约，于是空口有更多空闲时间',
      ],
      answer: 1,
      explain: '多重策略的数据帧重复预约的终点，帮助的是错过了 CTS、却收得到数据帧的站点；这里的 B 收不到 A 的任何一帧。',
    },
    {
      q: '为什么 CTS-to-self 在这间房子里起不到保护作用？',
      options: [
        '它的 Duration 比 RTS 短',
        '它由持有者自己发出，传播范围与持有者的其他帧相同，收不到持有者的隐藏站点也收不到它',
        '本仿真器禁止在走廊户型里使用它',
      ],
      answer: 1,
      explain: '§10.3.2.15 指出 CTS-to-self 对隐藏节点不如 RTS/CTS 可靠：RTS/CTS 里起作用的 CTS 由接收方发出，CTS-to-self 没有这一步。本仿真器的 Wi-Fi 站点没有实现 CTS-to-self，这一题只能按标准回答。',
    },
  ],
}
