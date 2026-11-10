/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · announcing a whole burst with one RTS/CTS.
 *
 * Standard-first shape (2026-11-11): ① what IEEE Std 802.11-2024 says about a TXOP and its limit
 * (§10.23.2.9, Table 9-194), the two classes of Duration setting a TXOP initiator chooses between
 * (§9.2.5.2 — single and multiple protection, and ONLY those two) and how a response frame relays
 * what is left (§9.2.5.6); ② what this simulator does with each; ③ four runs.
 *
 * **The audit finding this rewrite exists for.** The old lesson said 「标准称为边界保护（boundary
 * protection）」. The standard has no such class: §9.2.5.2 defines single and multiple protection,
 * the class is chosen with the TXOP's first frame and every later frame of that TXOP keeps it. The
 * engine's `'boundary'` policy is a hybrid — the opening RTS reaches the end of the TXOP like
 * multiple protection, the data frames then cover only their own acknowledgement — and its
 * `'single'` policy is not the standard's single protection either: §9.2.5.2 a)8) has a non-final
 * data frame cover the NEXT exchange too, and §9.2.5.6 has the access point's Ack relay it, so under
 * the standard a hidden station's reservation is carried forward exchange by exchange; the engine
 * writes 0 into every Ack. ② says both plainly, and the 46-against-21 comparison is labelled as the
 * engine's two policies, not as the standard's two classes.
 *
 * The three protect-policies lesson shares this scene and both variants (`sameSceneAs`), so the
 * recorded timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 *
 * Every figure the labs print is read back out of this file by tests/course/txop-protect.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstRts, firstCollision, J } from '../lessonKit'

/**
 * The run's own burst at 0.744 ms, as an exchange: who says what, when.
 *
 * Every row is a record of the base run — the RTS at 744 µs with Duration 2 500, the access
 * point's CTS at 788 with 2 456, the NAV_SET at the hidden station at 816 that runs to 3 272, the
 * first of five data frames at 832, and the last answer at 2 896 — and `txop-protect.test.ts`
 * reads each one back out of this spec. The far station is drawn as its own column because its
 * silence is the whole point: the only thing it ever does in this figure is load a reservation
 * from a frame that was addressed to somebody else.
 */
export function protectSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-2', label: '隐藏站 B' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-1', label: '隐藏站 A' },
    ],
    messages: [
      { from: 'sta-1', to: 'ap', label: 'RTS：预约 2 500 µs', at: '0.744 ms', tone: 'accent' },
      { from: 'ap', to: 'sta-1', label: 'CTS：2 456 µs', at: '0.788 ms', tone: 'accent' },
      { from: 'sta-2', to: 'sta-2', label: '预约到 3.272 ms', at: '0.816 ms' },
      { from: 'sta-1', to: 'ap', label: '五次交互，各 416 µs', at: '0.832 ms' },
      { from: 'ap', to: 'sta-1', label: '最后一个确认帧', at: '2.896 ms' },
    ],
  }
}

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 7,
  title: '保护突发——用 RTS/CTS 预约整串',
  why: '竞争成功的站点（station, STA）可以在一个传输机会（transmit opportunity, TXOP）里连续发出好几帧，IEEE Std 802.11-2024 只要求整个 TXOP 不超过所属接入类别（access category, AC）的 TXOP 上限（TXOP limit）。对于这样一串帧，标准为发起方规定了两类 Duration 设置：单次保护（single protection）每一帧只预约到下一帧及其应答为止，多重保护（multiple protection）可以一次预约到预计的整串结束，最长到 TXOP 的上限。两种方式都由第一帧选定，同一个 TXOP 里不再改变。两台站点相互收不到时，起作用的是接入点（access point, AP）回复的允许发送（clear to send, CTS）：它把请求发送（request to send, RTS）里的时长转述给持有者收不到的那台站点。本仿真器有三种策略，其中两种与标准不同：「边界」策略让开头的 RTS 按多重保护预约到 TXOP 末尾，此后的数据帧（data frame）却只覆盖自己的确认帧（acknowledgement, ACK）；「单次」策略让每个数据帧都只覆盖自己的确认帧，而标准的单次保护会让接入点的确认帧把预约逐次向后延伸。在走廊户型里，预约到 TXOP 末尾的那一侧 300 ms 内碰撞 26 次、送达 572 帧；只预约一次交互的那一侧碰撞 41 次、送达 269 帧。剩下的 26 次碰撞里有 22 次是两帧 RTS 相撞，损失的是一帧 RTS，而不是一整串帧。',
  outcomes: [
    '说出标准对 TXOP 上限与两类 Duration 设置规定了什么',
    '分清本仿真器的「单次」「边界」两种策略各在哪一点上与标准不同',
    '在时间轴上读出一条预约从哪一帧来、持续到何时，并对比两种策略的碰撞次数',
  ],
  // §6 of the re-pacing plan: the question-and-answer exchange moved to `rts-cts`, the half
  // that owns it, so this edge names that half rather than its parent.
  needs: ['nav', 'rts-cts', 'txop'],
  terms: [
    { term: 'single protection', plain: '单次保护：TXOP 里每一帧的 Duration 只预约到紧接着的下一帧及其应答' },
    { term: 'multiple protection', plain: '多重保护：Duration 可以一次预约到一串帧的预计结束，最长到 TXOP 的上限' },
    { term: 'protection', plain: '事先在 Duration 字段里声明要占用介质多长时间，使收不到你发送的站点也保持静默' },
  ],
  standard: [
    { heading: 'TXOP 与它的上限（§10.23.2.9，表 9-194）', text: 'TXOP 的时长是持有者不间断控制介质（medium）的时间，包括对方作为立即应答发出的帧。上限不为 0 时，持有者应保证 TXOP 不超过上限。上限由接入点在信标（Beacon）与 Probe Response 帧的增强型分布式信道接入（enhanced distributed channel access, EDCA）参数集（parameter set）元素里通告；表 9-194 给出默认值：第 17、18、19、21、27 章的物理层（physical layer, PHY）下，AC_BK 与 AC_BE 为 2.528 ms，AC_VI 为 4.096 ms，AC_VO 为 2.080 ms。' },
    { heading: '两类 Duration 设置（§9.2.5.2）', text: '在 EDCA 下发起 TXOP 的站点，Duration 字段有两类设置。收到一帧的站点按它的 Duration 设置网络分配向量（network allocation vector, NAV）。单次保护：这一预约只保护到紧接着的数据帧、管理帧（management frame）或应答帧结束，外加必要的附加开销。多重保护：这一预约可以保护到一串帧的预计结束。站点在发送 TXOP 的第一帧时二选一，同一个 TXOP 里此后发出的帧使用同一类设置。' },
    { heading: '单次保护下怎样填写（§9.2.5.2 a)）', text: 'RTS：待发的帧、一个 CTS、一个确认帧或块确认（block acknowledgement, BlockAck）与其间各个帧间间隔的时长。需要确认的单播数据帧：如果是 TXOP 的最后一帧，只覆盖一个确认帧及其帧间间隔；否则还要加上下一帧及其应答的时长。所以单次保护下的预约是逐帧向后延伸的，每一帧预告下一次交互。' },
    { heading: '多重保护下怎样填写（§9.2.5.2 b)）', text: '记当前 PPDU（PHY protocol data unit）的时长为 T_PPDU，这一类的 TXOP 上限为 T_TXOP，待发的帧连同应答与帧间间隔的预计时长为 T_PENDING，持有者已建立的 NAV 的剩余时长为 T_END-NAV。TXOP 的第一帧还没有建立 NAV，它的 Duration 不小于 min(T_PENDING, T_TXOP) − T_PPDU，不大于 T_TXOP − T_PPDU。建立 NAV 之后，每一帧的 Duration 不小于 T_END-NAV − T_PPDU，不大于 TXOP 的剩余时长减 T_PPDU：此后的每一帧都至少重复一遍已有预约的终点。' },
    { heading: '应答帧转述剩余的时间（§9.2.5.6）', text: '回应 RTS 的 CTS，Duration 等于 RTS 的 Duration 减去从 RTS 结束到 CTS 结束的时间，即一个短帧间间隔（short interframe space, SIFS）与 CTS 自身。确认帧与块确认同样从引出它的那一帧的 Duration 中减去这段时间。收不到持有者、却收得到接入点的站点，就是从这些应答帧得知预约的。' },
    { kind: 'steps', heading: '一个用多重保护开头的 TXOP，按标准：逐步说明', items: [
      '站点经 EDCA 竞争取得 TXOP，发送第一帧时选定多重保护（§9.2.5.2）。',
      '第一帧是 RTS，Duration 在 min(T_PENDING, T_TXOP) − T_PPDU 与 T_TXOP − T_PPDU 之间取值（§9.2.5.2 b)）。',
      '接入点在一个 SIFS 之后回复 CTS，Duration 是 RTS 的 Duration 减去 SIFS 与 CTS 自身（§9.2.5.6）。收得到接入点的站点都据此设置 NAV。',
      '持有者逐次发送数据帧，每一帧的 Duration 至少到已有预约的终点；接入点的确认帧再把剩余时间转述一遍（§9.2.5.2 b)，§9.2.5.6）。',
      '整个 TXOP 不超过这一类的上限（§10.23.2.9）。预约用不完时可以提前释放，见下一课。',
    ] },
  ],
  implementation: [
    { topic: 'TXOP 上限', standard: '持有者保证 TXOP 不超过上限；表 9-194 中 AC_BE 为 2.528 ms（§10.23.2.9）', sim: '照此：本课的数据帧都属 AC_BE，每个 TXOP 从开始起最长 2 528 µs，每一次交互都必须在上限之内结束才会发出。', kind: 'faithful' },
    { topic: '上限从哪里来', standard: '接入点在信标与 Probe Response 帧的 EDCA 参数集元素里通告（§10.23.2.9）', sim: '本仿真器不发信标，四类的上限是一张常量表，取表 9-194 的默认值。', kind: 'absent' },
    { topic: '两类设置的选择', standard: '第一帧时在单次与多重两类之间选定，同一 TXOP 里不变（§9.2.5.2）', sim: '每台站点由场景固定一种策略：单次、「边界」或多重。「边界」不是标准里的类别，见下面两行。', kind: 'differs' },
    { topic: '单次保护下的 RTS', standard: '待发的帧、CTS、确认帧与各个帧间间隔（§9.2.5.2 a)1)）', sim: '照此计算。本课的单次变体里这一值是 460 µs。', kind: 'faithful' },
    { topic: '单次保护下的数据帧', standard: '最后一帧只覆盖确认帧；其余各帧再加下一帧及其应答（§9.2.5.2 a)8)）', sim: '「单次」策略下每个数据帧都按最后一帧填写，只覆盖一个 SIFS 与自己的确认帧，不预告下一次交互。', kind: 'differs' },
    { topic: '确认帧的 Duration', standard: '引出它的那一帧的 Duration 减去 SIFS 与确认帧自身（§9.2.5.6）', sim: '确认帧与块确认一律写 0。数据帧只覆盖自己的确认帧时，按标准算出的也是 0；数据帧带着更长的 Duration 时，标准的确认帧会把剩余时间转述出去，本仿真器不转述。', kind: 'differs' },
    { topic: '「边界」策略', standard: '没有「边界保护（boundary protection）」这一类；第一帧选了多重保护，此后各帧的 Duration 至少到已有预约的终点（§9.2.5.2 b)）', sim: '开头的 RTS 按多重保护预约到 TXOP 末尾，此后的数据帧却只覆盖自己的确认帧，即单次保护里最后一帧的写法。本课的基础场景就是这一策略。', kind: 'differs' },
    { topic: '多重保护下 RTS 的取值', standard: '在 min(T_PENDING, T_TXOP) − T_PPDU 与 T_TXOP − T_PPDU 之间（§9.2.5.2 b)）', sim: '取上限：预约到 TXOP 的起点加上限，RTS 的 Duration 等于 TXOP 上限减去 RTS 自身的时长。「边界」与多重两种策略都这样取。', kind: 'value' },
    { topic: '何时用 RTS 开启一串', standard: 'PSDU（PHY service data unit）长于 dot11RTSThreshold 时必须先发 RTS（§10.3.5）；用 RTS 开启多重保护标准没有另外的条件', sim: '「边界」与多重策略下，只有估算出这个 TXOP 能容纳不止一次交互时，才用预约到末尾的 RTS 开启；只容纳一次交互的 TXOP 仍只看 RTS 门限（RTS threshold）。', kind: 'choice' },
    { topic: '估算能容纳几次交互', standard: 'T_PENDING 是预计的时长，估算方法标准不规定（§9.2.5.2）', sim: '把这一类队列（queue）里待发的帧逐一按交互时长累加，直到下一次交互会超出 TXOP 上限为止。', kind: 'choice' },
    { topic: 'CTS 的 Duration', standard: 'RTS 的 Duration 减去 SIFS 与 CTS 自身（§9.2.5.6）', sim: '照此计算，以纳秒记录、不取整。', kind: 'faithful' },
    { topic: '收到 CTS 的旁听站点', standard: '接收端地址（receiver address, RA）不是自己、且 Duration 大于当前 NAV 时更新 NAV（§10.3.2.4）', sim: '照此。本课的隐藏站点只收得到接入点，它的每一条预约都来自接入点的 CTS。', kind: 'faithful' },
    { topic: '收不收得到', standard: '前导检测（preamble detection）：−82 dBm 时以大于 90% 的概率检出（§17.3.10.6.1）', sim: '硬门限：达到就一定收到，差一点就一定收不到。两台隐藏站点之间每一次都收不到，各自到接入点每一次都收得到；本课信道为 20 MHz，能量检测（energy detection, ED）按整个信道宽度比较与标准一致。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '一帧 RTS 预约到 TXOP 末尾',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个 RTS：两台站点在 t = 0 同时发出，相撞。',
        '向后找到 0.744 ms 那个 RTS，逐帧读出时刻与 Duration，并看隐藏站 B 的泳道在哪一帧之后出现预约。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '0.744 ms 那一串：一次 RTS/CTS 交互覆盖整串',
          spec: protectSequence(),
          caption: '隐藏站 B 始终收不到 A。它那条预约是根据接入点的 CTS 设置的——本轮里它唯一能解调的一帧——一直持续到 3.272 ms，而 A 的五次交互到 2.896 ms 才结束。',
        },
        { kind: 'table', heading: '从 0.744 ms 开始的那一串，逐项数值', head: ['步骤', '数值'], rows: [
          ['TXOP 开始，AC_BE 的上限', '2 528 µs'],
          ['RTS 发出，Duration', '2 500 µs'],
          ['接入点回复 CTS，Duration', '2 456 µs'],
          ['隐藏站 B 设置 NAV，到', '3.272 ms'],
          ['每次交互的时长；每个数据帧的 Duration', '416 µs；44 µs'],
          ['最后一个确认帧结束于', '2.896 ms'],
          ['预约到期之前还剩', '376 µs'],
        ] },
      ],
      expect: '0.744 ms 的 RTS 是 A 的第三次尝试，Duration 2 500 µs，正好是 TXOP 上限减去 RTS 自身的 28 µs；接入点在 0.788 ms 回复 CTS，Duration 2 456 µs；B 在 0.816 ms 依据这帧 CTS 设置 NAV，一直到 3.272 ms。此后五个数据帧的 Duration 都只有 44 µs，即一个 SIFS 加一个确认帧。',
      meaning: 'RTS 预约到 TXOP 末尾，是多重保护允许的上限（② 多重保护下 RTS 的取值）；起作用的是接入点的 CTS（① §9.2.5.6）。数据帧只写 44 µs，是本仿真器「边界」策略的写法，标准的多重保护要求它们至少写到 3.272 ms（②「边界」策略）。',
    },
    {
      heading: '只预约一次交互：预约在中途到期',
      variant: 0,
      steps: [
        '载入「单次保护（逐次交换）」，运行到 1.7 ms。',
        '看 0.744 ms 那一串：读出 CTS 的 Duration 与 B 的 NAV 到期时刻，再找 B 下一次发出 RTS 的时刻与随后的碰撞。',
        '运行满 300 ms，与本课场景的 300 ms 对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的 300 ms：只预约一次交互与预约到 TXOP 末尾', head: ['300 ms 内的统计', '单次', '边界'], rows: [
          ['碰撞次数', '41', '26'],
          ['成功送达的数据帧', '269', '572'],
          ['重传（retry）', '96', '58'],
          ['丢弃帧数', '5', '1'],
          ['隐藏站点每条预约的平均时长', '1.16 ms', '2.44 ms'],
        ] },
      ],
      expect: '同一个 0.744 ms 的 RTS 这次只写 460 µs，CTS 写 416 µs，B 的 NAV 到 1.232 ms 就到期；B 在 1.383 ms 发出 RTS，与 A 正在发送的第二个数据帧相撞，碰撞记在 1.604 ms。300 ms 内碰撞 41 次，送达 269 帧，都比本课场景差。',
      meaning: '本仿真器的「单次」策略里，确认帧写 0、数据帧不预告下一次交互（②），所以 B 只被告知一次交互。按标准的单次保护，A 的数据帧会覆盖下一次交互，接入点的确认帧会把它转述给 B（① §9.2.5.2 a)8)、§9.2.5.6）；这张表对比的是本仿真器的两种策略，不是标准的两类设置。',
    },
    {
      heading: '剩下的碰撞',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一次碰撞，再运行满 300 ms。',
        '逐一查看碰撞记录，读出每一次碰撞结束时正在结束的是哪一种帧。',
      ],
      expect: '第一次碰撞落在 t = 28 µs，是 t = 0 同时发出的两帧 RTS 结束的时刻。300 ms 内的 26 次碰撞里，22 次是两帧 RTS 相撞，每次各损失一帧 20 字节的 RTS；只有 4 次碰上了正在发送的数据帧。',
      meaning: 'RTS/CTS 不消除碰撞，只把有风险的时间缩短到一帧 RTS 的长度；预约到 TXOP 末尾之后，一整串帧都在预约之内（① §9.2.5.2）。',
    },
    {
      heading: '只容纳一次交互的 TXOP',
      steps: [
        '在编辑器中打开本课场景，把 RTS 门限从 500 字节改为 3000 字节，高过这里的每一帧，运行 300 ms。',
        '读出碰撞次数与送达的帧数，再看失去保护的是哪些 TXOP。',
      ],
      expect: '碰撞从 26 次升到 82 次，送达从 572 帧降到 332 帧。失去保护的是只容纳得下一次交互的 TXOP：它们不满足「容纳不止一次交互」这个条件，又低于门限，于是不发 RTS 就直接发数据帧；其中最慢的一帧占了 1.9 ms 的空口时间（airtime）。',
      meaning: '「只有估算出不止一次交互才用 RTS 开启」是本仿真器的取法（② 何时用 RTS 开启一串）；标准只规定长于门限的帧必须先发 RTS（§10.3.5）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.9（TXOP 的时长与上限，上限由 EDCA 参数集元素通告）、表 9-194（各接入类别默认的 TXOP 上限）、§9.2.5.2（EDCA 下单次保护与多重保护两类 Duration 设置及其公式）、§9.2.5.6（CTS、确认帧与块确认的 Duration）、§10.3.2.4（旁听站点更新 NAV）、§10.3.5（dot11RTSThreshold）、§17.3.10.6.1（前导检测）。',
    '本仿真器的取值与取法：500 字节的 RTS 门限、每台站点固定的保护策略（其中「边界」策略不是标准的类别）、RTS 预约到 TXOP 上限、按队列累加估算交互次数、确认帧写 0、收发的硬门限。上面每一个计数与时刻都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
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
    J('第一个 RTS', firstRts),
    J('第一次碰撞', firstCollision),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '隐藏站 B 始终收不到 A。是哪一帧使 B 在 A 的整串帧期间保持静默？',
      options: [
        'A 的 RTS',
        '接入点的 CTS',
        'A 的第一个数据帧',
      ],
      answer: 1,
      explain: 'B 只能收到接入点。接入点的 CTS 按 §9.2.5.6 把 RTS 的预约减去 SIFS 与 CTS 自身后转述出去，本课里一直到 TXOP 末尾。',
    },
    {
      q: '同样一台收不到你的邻居，为什么“一串帧”比“单独一帧”更危险？',
      options: [
        '一串帧发得更快，更容易出错',
        '它给那台收不到的站点留出的可能发生碰撞的时间长得多：这里是 2 ms，而不是 0.4 ms',
        '一串帧里的校验更弱',
      ],
      answer: 1,
      explain: '0.744 ms 那一串从 RTS 到最后一个确认帧约 2.2 ms，而一次交互只有 416 µs；预约只覆盖一次交互时，其余的时间都暴露在外。',
    },
    {
      q: '下面哪一项是 IEEE Std 802.11-2024 §9.2.5.2 定义的 Duration 设置类别？',
      options: [
        '单次保护与多重保护两类',
        '单次、边界、多重三类',
        '只有一类，由 RTS 门限决定',
      ],
      answer: 0,
      explain: '标准只有两类，由 TXOP 的第一帧选定；本仿真器的「边界」策略是开头按多重保护、此后按单次保护最后一帧写法的混合，不是标准的类别。',
    },
  ],
}
