/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · protecting a burst: single and multiple protection.
 *
 * Standard-first shape (2026-11-11): ① what IEEE Std 802.11-2024 says about a TXOP and its limit
 * (§10.23.2.9, Table 9-194), the two classes of Duration setting a TXOP initiator chooses between
 * (§9.2.5.2 — single and multiple protection, and ONLY those two) and how a response frame relays
 * what is left (§9.2.5.6); ② what this simulator does with each; ③ four runs.
 *
 * **W7a (2026-11-11).** The engine's third policy, `'boundary'`, was not a class the standard
 * defines and is gone; its `'single'` policy now writes §9.2.5.2 a)8)'s Duration (a non-final data
 * frame covers the next exchange) and every Ack relays its eliciting frame's Duration (§9.2.5.6).
 * So the base scene is multiple protection and the variant single protection, both as the standard
 * has them, and the comparison the labs make is between the standard's two classes.
 *
 * The protect-policies lesson shares this scene and its variant (`sameSceneAs`).
 *
 * Every figure the labs print is read back out of this file by tests/course/txop-protect.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstRts, firstCollision, J } from '../lessonKit'

/**
 * The run's own burst at 0.736 ms under multiple protection, as an exchange: who says what, when.
 *
 * Every row is a record of the base run — the RTS at 736 µs with Duration 2 500, the access
 * point's CTS at 780 with 2 456, the NAV_SET at the hidden station at 808 that runs to 3 264, the
 * first of five data frames at 824, and the last answer at 2 888 — and `txop-protect.test.ts`
 * reads each one back out of this spec.
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
      { from: 'sta-1', to: 'ap', label: 'RTS：预约 2 500 µs', at: '0.736 ms', tone: 'accent' },
      { from: 'ap', to: 'sta-1', label: 'CTS：2 456 µs', at: '0.780 ms', tone: 'accent' },
      { from: 'sta-2', to: 'sta-2', label: '预约到 3.264 ms', at: '0.808 ms' },
      { from: 'sta-1', to: 'ap', label: '五次交互，各 416 µs', at: '0.824 ms' },
      { from: 'ap', to: 'sta-1', label: '最后一个确认帧', at: '2.888 ms' },
    ],
  }
}

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 7,
  title: '保护突发——单次保护与多重保护',
  why: '竞争成功的站点（station, STA）可以在一个传输机会（transmit opportunity, TXOP）里连续发出好几帧，IEEE Std 802.11-2024 只要求整个 TXOP 不超过所属接入类别（access category, AC）的 TXOP 上限（TXOP limit）。对于这样一串帧，标准为发起方规定了两类 Duration 设置：单次保护（single protection）每一帧只预约到下一帧及其应答为止，多重保护（multiple protection）可以一次预约到 TXOP 的上限，此后每一个数据帧（data frame）都重复这个终点。两种方式都由第一帧选定，同一个 TXOP 里不再改变。两台站点相互收不到时，起作用的是接入点（access point, AP）的应答帧：允许发送（clear to send, CTS）与确认帧（acknowledgement, ACK）都把引出它的那一帧的 Duration 减去自身后转述出去，所以多重保护下隐藏站点从 CTS 一次得知整个 TXOP，单次保护下它从每一个确认帧得知下一次交互。在走廊户型里，多重保护那一侧 300 ms 内碰撞 28 次、送达 437 帧；单次保护那一侧碰撞 8 次、送达 799 帧。多重保护那一侧的 28 次碰撞里有 24 次是两帧请求发送（request to send, RTS）相撞，损失的是一帧 RTS，而不是一整串帧。',
  outcomes: [
    '说出标准对 TXOP 上限与两类 Duration 设置规定了什么',
    '说明隐藏站点在两类设置下分别从哪一帧得知预约，以及预约持续到何时',
    '在时间轴上读出一条预约从哪一帧来、持续到何时，并对比两类设置的碰撞次数',
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
    { topic: '两类设置的选择', standard: '第一帧时在单次与多重两类之间选定，同一 TXOP 里不变（§9.2.5.2）；怎样选标准不规定', sim: '每台站点由场景固定一类：单次保护或多重保护，它的每个 TXOP 都用这一类。本课的基础场景是多重保护，变体是单次保护。', kind: 'choice' },
    { topic: '单次保护下的 RTS', standard: '待发的帧、CTS、确认帧与各个帧间间隔（§9.2.5.2 a)1)）', sim: '照此计算。本课的单次变体里这一值是 460 µs。', kind: 'faithful' },
    { topic: '单次保护下的数据帧', standard: '最后一帧只覆盖确认帧；其余各帧再加下一帧及其应答（§9.2.5.2 a)8)）', sim: '照此：不是最后一帧的数据帧写 SIFS、确认帧、SIFS、下一帧与它的确认帧之和，本课里是 460 µs；最后一帧写 44 µs。', kind: 'faithful' },
    { topic: '哪一帧是最后一帧', standard: '「是否 TXOP 的最后一帧」由持有者在发送时判断；下一帧的时长是预计值（§9.2.5.2）', sim: '构造这一帧时，按队列（queue）里剩下的帧与当时的速率估算：下一次交互放不进上限就按最后一帧填写。此后才到达的帧、或成功之后提高的速率，仍可能让上限之内再多一次交互；那一帧不在任何隐藏站点的预约之内。', kind: 'choice' },
    { topic: '确认帧的 Duration', standard: '引出它的那一帧的 Duration 减去 SIFS 与确认帧自身（§9.2.5.6）', sim: '照此：确认帧与块确认都转述剩余的时间，结果为负时写 0。', kind: 'faithful' },
    { topic: '多重保护下 RTS 与数据帧的取值', standard: '第一帧在 min(T_PENDING, T_TXOP) − T_PPDU 与 T_TXOP − T_PPDU 之间；此后在 T_END-NAV − T_PPDU 与 TXOP 剩余时长减 T_PPDU 之间（§9.2.5.2 b)）', sim: '一律取上限：每一帧都预约到 TXOP 的起点加上限。RTS 的 Duration 等于 TXOP 上限减去 RTS 自身的时长。', kind: 'value' },
    { topic: '何时用 RTS 开启一串', standard: 'PSDU（PHY service data unit）长于 dot11RTSThreshold 时必须先发 RTS（§10.3.5）', sim: '照此：两类设置都只看 RTS 门限（RTS threshold）。不发 RTS 的多重保护 TXOP 由第一个数据帧预约到 TXOP 末尾。', kind: 'faithful' },
    { topic: 'CTS 的 Duration', standard: 'RTS 的 Duration 减去 SIFS 与 CTS 自身（§9.2.5.6）', sim: '照此计算，以纳秒记录、不取整。', kind: 'faithful' },
    { topic: '收到应答帧的旁听站点', standard: '接收端地址（receiver address, RA）不是自己、且 Duration 大于当前 NAV 时更新 NAV（§10.3.2.4）', sim: '照此。本课的隐藏站点只收得到接入点：多重保护下它的预约来自接入点的 CTS，单次保护下来自 CTS 与此后的每一个确认帧。', kind: 'faithful' },
    { topic: '收不收得到', standard: '前导检测（preamble detection）：−82 dBm 时以大于 90% 的概率检出（§17.3.10.6.1）', sim: '硬门限：达到就一定收到，差一点就一定收不到。两台隐藏站点之间每一次都收不到，各自到接入点每一次都收得到；本课信道为 20 MHz，能量检测（energy detection, ED）按整个信道宽度比较与标准一致。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '多重保护：一帧 RTS 预约到 TXOP 末尾',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个 RTS：两台站点在 t = 0 同时发出，相撞。',
        '向后找到 0.736 ms 那个 RTS，逐帧读出时刻与 Duration，并看隐藏站 B 的泳道在哪一帧之后出现预约。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '0.736 ms 那一串：一次 RTS/CTS 交互覆盖整串',
          spec: protectSequence(),
          caption: '隐藏站 B 始终收不到 A。它那条预约是根据接入点的 CTS 设置的，一直持续到 3.264 ms，而 A 的五次交互到 2.888 ms 才结束。',
        },
        { kind: 'table', heading: '从 0.736 ms 开始的那一串，逐项数值', head: ['步骤', '数值'], rows: [
          ['TXOP 开始，AC_BE 的上限', '2 528 µs'],
          ['RTS 发出，Duration', '2 500 µs'],
          ['接入点回复 CTS，Duration', '2 456 µs'],
          ['隐藏站 B 设置 NAV，到', '3.264 ms'],
          ['每次交互的时长', '416 µs'],
          ['最后一个确认帧结束于', '2.888 ms'],
          ['预约到期之前还剩', '376 µs'],
        ] },
      ],
      expect: '0.736 ms 的 RTS 是 A 的第三次尝试，Duration 2 500 µs，正好是 TXOP 上限减去 RTS 自身的 28 µs；接入点在 0.780 ms 回复 CTS，Duration 2 456 µs；B 在 0.808 ms 依据这帧 CTS 设置 NAV，一直到 3.264 ms。此后五个数据帧的 Duration 依次是 2 084、1 668、1 252、836、420 µs，每一个都写到 3.264 ms，接入点的五个确认帧也都写到 3.264 ms。',
      meaning: 'RTS 与此后每一帧都预约到 TXOP 末尾，是多重保护允许的上限（② 多重保护下 RTS 与数据帧的取值）；B 能听到的只有接入点的 CTS 与确认帧，它们按 §9.2.5.6 转述同一个终点（①）。',
    },
    {
      heading: '单次保护：确认帧逐次转述预约',
      variant: 0,
      steps: [
        '载入「单次保护」，运行到 3 ms。',
        '看 0.736 ms 那一串：读出 RTS、CTS、每个数据帧与每个确认帧的 Duration，以及 B 的 NAV 每一次延长到何时。',
        '运行满 300 ms，与本课场景的 300 ms 对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的 300 ms：单次保护与多重保护', head: ['300 ms 内的统计', '单次', '多重'], rows: [
          ['碰撞次数', '8', '28'],
          ['成功送达的数据帧', '799', '437'],
          ['重传（retry）', '18', '64'],
          ['丢弃帧数', '0', '0'],
          ['隐藏站点每条预约的平均时长', '0.34 ms', '2.45 ms'],
        ] },
      ],
      expect: '同一个 0.736 ms 的 RTS 这次只写 460 µs，CTS 写 416 µs，B 的 NAV 先到 1.224 ms；此后前四个数据帧都写 460 µs，接入点的确认帧各写 416 µs，B 的 NAV 依次延长到 1.640、2.056、2.472、2.888 ms；第五个数据帧是最后一帧，只写 44 µs，它的确认帧写 0。300 ms 内碰撞 8 次，送达 799 帧。',
      meaning: '单次保护下每个数据帧预告下一次交互，接入点的确认帧把它转述给 B（① §9.2.5.2 a)8)、§9.2.5.6），所以 B 在整串里始终处于预约之中，只是每次只被告知 416 µs。在这间房子里它比多重保护碰撞更少、送达更多。',
    },
    {
      heading: '剩下的碰撞',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一次碰撞，再运行满 300 ms。',
        '逐一查看碰撞记录，读出每一次碰撞结束时正在结束的是哪一种帧。',
      ],
      expect: '第一次碰撞落在 t = 28 µs，是 t = 0 同时发出的两帧 RTS 结束的时刻。300 ms 内的 28 次碰撞里，24 次是两帧 RTS 相撞，每次各损失一帧 20 字节的 RTS；只有 4 次碰上了正在发送的数据帧。',
      meaning: 'RTS/CTS 不消除碰撞，只把有风险的时间缩短到一帧 RTS 的长度；预约建立之后，一整串帧都在预约之内（① §9.2.5.2）。',
    },
    {
      heading: '不发 RTS 的 TXOP',
      steps: [
        '在编辑器中打开本课场景，把 RTS 门限从 500 字节改为 3000 字节，高过这里的每一帧，运行 300 ms。',
        '读出碰撞次数与送达的帧数，再看隐藏站 B 的预约来自哪一帧。',
      ],
      expect: '碰撞从 28 次升到 98 次，送达从 437 帧降到 234 帧。没有 RTS，每个 TXOP 的第一个数据帧在 B 那里没有任何预约，B 的预约只能来自接入点的确认帧，这时第一个数据帧已经发完；其中最慢的一帧占了 1.932 ms 的空口时间（airtime）。',
      meaning: '长于门限的帧必须先发 RTS（② 何时用 RTS 开启一串，§10.3.5）；门限高过每一帧，多重保护的预约要等到第一个确认帧才传到隐藏站点（① §9.2.5.6）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.9（TXOP 的时长与上限，上限由 EDCA 参数集元素通告）、表 9-194（各接入类别默认的 TXOP 上限）、§9.2.5.2（EDCA 下单次保护与多重保护两类 Duration 设置及其公式）、§9.2.5.6（CTS、确认帧与块确认的 Duration）、§10.3.2.4（旁听站点更新 NAV）、§10.3.5（dot11RTSThreshold）、§17.3.10.6.1（前导检测）。',
    '本仿真器的取值与取法：500 字节的 RTS 门限、每台站点固定的一类设置、多重保护取 Duration 的上限、按队列估算哪一帧是最后一帧、收发的硬门限。上面每一个计数与时刻都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
  ],
  limits: [],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
    { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
  ], { rtsThresholdBytes: 500 }),
  variants: [
    {
      label: '单次保护',
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
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
      q: '多重保护下，隐藏站 B 始终收不到 A。是哪一帧使 B 在 A 的整串帧期间保持静默？',
      options: [
        'A 的 RTS',
        '接入点的 CTS',
        'A 的第一个数据帧',
      ],
      answer: 1,
      explain: 'B 只能收到接入点。接入点的 CTS 按 §9.2.5.6 把 RTS 的预约减去 SIFS 与 CTS 自身后转述出去，本课里一直到 TXOP 末尾；此后的确认帧再重复同一个终点。',
    },
    {
      q: '同样一台收不到你的邻居，为什么“一串帧”比“单独一帧”更需要预约？',
      options: [
        '一串帧发得更快，更容易出错',
        '它给那台收不到的站点留出的可能发生碰撞的时间长得多：这里是 2 ms，而不是 0.4 ms',
        '一串帧里的校验更弱',
      ],
      answer: 1,
      explain: '0.736 ms 那一串从 RTS 到最后一个确认帧约 2.152 ms，而一次交互只有 416 µs；预约只覆盖一次交互、又没有确认帧向后转述时，其余的时间都暴露在外。',
    },
    {
      q: '下面哪一项是 IEEE Std 802.11-2024 §9.2.5.2 定义的 Duration 设置类别？',
      options: [
        '单次保护与多重保护两类',
        '单次、边界、多重三类',
        '只有一类，由 RTS 门限决定',
      ],
      answer: 0,
      explain: '标准只有两类，由 TXOP 的第一帧选定，同一 TXOP 里不变。',
    },
  ],
}
