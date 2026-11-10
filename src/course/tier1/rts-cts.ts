/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · the access point asks out loud for you.
 *
 * Standard-first shape (2026-11-11): ① IEEE Std 802.11-2024's RTS/CTS — what it is for (§10.3.1),
 * when it is used (§10.3.5, dot11RTSThreshold), the two frames and their Durations (§9.3.1.2,
 * §9.3.1.3), when the addressee answers and the CTSTimeout (§10.3.2.9), the bystanders' NAV and its
 * RTS reset (§10.3.2.4) and the rates (§10.6.6.2, §10.6.6.5.2); ② what this simulator does with
 * each — including the nanosecond Duration; since W7a (2026-11-11) the CTS rule's TXOP-holder
 * exception is implemented (§10.3.2.9, §10.23.2.4), so that row is faithful; ③ three runs.
 *
 * The scene is `hidden`'s, unchanged (`sameSceneAs: 'hidden'`). The base scene never sends an RTS,
 * so the one jump is the first collision, which the comparison lab starts from.
 *
 * Every figure the labs print is read back out of this file by tests/course/rts-cts.test.ts.
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
  why: '相互收不到信号的两台站点（station, STA）无法协调发送顺序，但房间里有一台设备能同时收到双方——走廊上的接入点（access point, AP）。IEEE Std 802.11-2024 为此规定了请求发送（request to send, RTS）与允许发送（clear to send, CTS）交换：发送长的数据帧（data frame）之前先发一个 20 字节的 RTS，接收方在一个短帧间间隔（short interframe space, SIFS）之后回复一个 14 字节的 CTS。两帧的 Duration 都覆盖其后的整个交换，收到其中任何一帧、而接收端地址（receiver address, RA）不是自己的站点，都据此设置网络分配向量（network allocation vector, NAV）。所以起作用的是 CTS：它从接收方发出，发送方收不到的站点也能收到。帧长超过 RTS 门限（RTS threshold）的帧才先发 RTS，门限由管理者设定。本仿真器照标准计算两帧的长度与 Duration，也照标准决定何时回复 CTS；与标准不同的是 Duration 以纳秒计、不取整。本课的场景就是上一课的走廊户型：受保护的变体把门限设为 500 字节，每一帧都先发 RTS。碰撞并没有消失，大多变成两个 RTS 相撞，损失的是 20 字节而不是一整轮交换：300 ms 内涉及数据帧的碰撞从 126 次降到 7 次，送达的帧数从 45 增加到 329，代价是每个数据帧之前多一次 RTS/CTS 交换。',
  outcomes: [
    '说出标准对 RTS、CTS 的长度、Duration 与使用条件规定了什么',
    '分清本仿真器的哪些做法照标准、哪些是它自己的取法或与标准不同',
    '对比同一场景在关闭与开启这一交换时的碰撞次数，并说出代价',
  ],
  needs: ['hidden'],
  terms: [
    { term: 'RTS', plain: '请求发送：发送长帧之前先发出的一个短帧，它的 Duration 覆盖其后的整个交换' },
    { term: 'CTS', plain: '允许发送：接收方回复的短帧，接收方覆盖范围内的站点都能收到，并据此设置 NAV' },
    { term: 'RTS threshold', plain: '一个帧长门限：帧长超过它，发送前先进行一次 RTS/CTS 交换' },
  ],
  standard: [
    { heading: 'RTS/CTS 的作用（§10.3.1）', text: 'RTS 与 CTS 都带 Duration 字段，给出为发送数据帧及其确认帧（acknowledgement, ACK）而预约介质（medium）的时长。收到 RTS 或 CTS 的站点都要处理这项预约，所以一台站点即使收不到发送方，也能得知介质将被占用。§10.3.1 还指出：这一机制可以改善所有站点都能收到接入点、却不一定能收到其他所有站点的情况；RTS 与 CTS 增加开销，对短的数据帧并不总是值得。' },
    { heading: '何时使用（§10.3.5）', text: '站点发送单播数据帧或管理帧（management frame）时，PSDU（PHY service data unit）的长度大于 dot11RTSThreshold，就必须先进行 RTS/CTS 交换；站点也可以为其他目的使用这一交换。使用时，数据帧在 CTS 结束一个 SIFS 之后开始发送。dot11RTSThreshold 是一个管理属性，标准不给出取值。' },
    { heading: 'RTS 与 CTS 的格式（§9.3.1.2，§9.3.1.3）', text: 'RTS 由帧控制（Frame Control）、Duration、接收端地址、发送端地址（transmitter address, TA）与帧校验序列（frame check sequence, FCS）组成，共 2 + 2 + 6 + 6 + 4 = 20 个八位组；CTS 没有发送端地址，共 14 个八位组（图 9-41、图 9-42）。不支持服务质量（quality of service, QoS）的站点发出的 RTS，Duration 等于待发的帧加一个 CTS、一个确认帧与三个 SIFS 的时长；回应 RTS 的 CTS，Duration 等于 RTS 的 Duration 减去 CTS 自身与一个 SIFS 的时长。含有不足 1 µs 的部分时，向上取整。' },
    { heading: '接收方何时回复 CTS（§10.3.2.9）', text: '被 RTS 寻址的站点，若 NAV 表示空闲，就在一个 SIFS 之后回复 CTS；否则不回复。「NAV 表示空闲」是指 NAV 为 0，或者 NAV 不为 0 但 RTS 的发送端地址等于记录的传输机会（transmit opportunity, TXOP）持有者地址。发出 RTS 的站点等待一段 CTS 超时，长度为 aSIFSTime + aSlotTime + aRxPHYStartDelay；其间没有开始接收，就判定 RTS 发送失败，启动退避（backoff）。' },
    { heading: '旁听站点的 NAV（§10.3.2.4）', text: '收到 RTS 或 CTS 的其他站点按一般规则更新 NAV：接收端地址不是自己、且 Duration 大于当前 NAV 时更新。依据 RTS 设置 NAV 的站点，若在 NAVTimeout 内没有开始接收任何帧，可以把 NAV 复位；NAVTimeout 等于 2 × aSIFSTime + CTS_Time + aRxPHYStartDelay + 2 × aSlotTime。' },
    { heading: 'RTS 与 CTS 的速率（§10.6.6.2，§10.6.6.5.2）', text: '开启一次交换的 RTS 在非 HT 格式中发送时，取基本速率集（BSSBasicRateSet）中的一个速率，基本速率集为空时取物理层（physical layer, PHY）的强制速率（mandatory rate）之一。CTS 是控制回应帧，取基本速率集中不高于 RTS 速率的最高速率，没有时取不高于 RTS 速率的最高强制速率。' },
    { kind: 'steps', heading: '一次受保护的交换，按标准：逐步说明', items: [
      '站点要发送的 PSDU 长度大于 dot11RTSThreshold，于是先发 RTS；Duration 等于数据帧、CTS、确认帧与三个 SIFS 的时长（§10.3.5，§9.3.1.2）。',
      '收得到发送方的站点据此设置 NAV；收不到的站点什么也不知道（§10.3.2.4）。',
      '接收方的 NAV 表示空闲，于是在一个 SIFS 之后回复 CTS，Duration 等于 RTS 的 Duration 减去一个 SIFS 与 CTS 自身（§10.3.2.9，§9.3.1.3）。',
      '收得到接收方的站点据此设置 NAV，包括发送方收不到的那些站点（§10.3.1）。',
      'CTS 结束一个 SIFS 之后，发送方发送数据帧；再过一个 SIFS，接收方回复确认帧（§10.3.5）。',
      '发送方在 CTS 超时内没有收到 CTS，就判定 RTS 失败，重新退避（§10.3.2.9）。',
    ] },
  ],
  implementation: [
    { topic: '何时先发 RTS', standard: 'PSDU 长度大于 dot11RTSThreshold（§10.3.5）', sim: '照此：帧长大于场景的 RTS 门限就先发 RTS。本课的数据帧都是 1528 字节。', kind: 'faithful' },
    { topic: '门限取值', standard: '管理属性，标准不给出取值', sim: '基准场景 3000 字节，高于任何一帧，所以从不发 RTS；受保护的变体 500 字节，每一帧都先发 RTS。', kind: 'value' },
    { topic: 'RTS 与 CTS 的长度', standard: '20 与 14 个八位组（§9.3.1.2，§9.3.1.3）', sim: '照此。', kind: 'faithful' },
    { topic: 'RTS 的 Duration', standard: '待发的帧、CTS、确认帧与三个 SIFS 的时长（§9.3.1.2）', sim: '照此计算。', kind: 'faithful' },
    { topic: 'CTS 的 Duration', standard: 'RTS 的 Duration 减去一个 SIFS 与 CTS 自身（§9.3.1.3）', sim: '照此计算。', kind: 'faithful' },
    { topic: 'Duration 的单位与取整', standard: '以微秒为单位，向上取整（§9.3.1.2，§9.3.1.3）', sim: '本仿真器以纳秒整数记录，不取整，全场时钟一致，所以预约恰好在确认帧结束的那一纳秒到期。', kind: 'differs' },
    { topic: '回复 CTS 的条件', standard: 'NAV 为 0，或 RTS 的发送端地址等于记录的传输机会持有者地址（§10.3.2.9）', sim: '照此：NAV 为 0，或者 RTS 的发送端地址等于记录的传输机会持有者地址，就回复 CTS。本课场景里接入点是每一帧的接收方，从不设置 NAV，所以总是第一种情形。', kind: 'faithful' },
    { topic: 'CTS 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay（§10.3.2.9）', sim: '照此：45 µs。', kind: 'faithful' },
    { topic: '依据 RTS 的 NAV 复位', standard: '可以在 NAVTimeout 内没有开始接收时复位（§10.3.2.4）', sim: '照此实现，NAVTimeout 按标准的公式计算。本课场景里 RTS 只发给接入点，没有旁听站点收到 RTS，所以不出现这种复位。', kind: 'faithful' },
    { topic: 'RTS 的速率', standard: '基本速率集中的一个速率，空集时取强制速率之一（§10.6.6.2）', sim: '本仿真器没有基本速率集；RTS 取强制速率 6、12、24 Mb/s 中不高于数据帧速率的最高一档，所以随数据帧的速率变化。受保护的变体里 RTS 用过 24、12、6 Mb/s 三档，空口时间（airtime）分别是 28、36、52 µs。', kind: 'choice' },
    { topic: '判忙门限', standard: '−82 dBm 时以大于 90% 的概率检测（§17.3.10.6.1）', sim: '硬门限，同上一课：RTS 到达对面房间时比门限低 1.4 dB，每一次都收不到；CTS 到达那里是 −60.6 dBm，高于门限。', kind: 'differs' },
    { topic: '跨网络的预约', standard: '预约机制跨越基本服务集（basic service set, BSS）的边界同样起作用（§10.3.1）', sim: '未实现：一个场景只能有一个接入点，邻居网络的 CTS 使本机不能发送的情况无法复现。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一次受保护的交换',
      variant: 0,
      steps: [
        '载入「开启 RTS/CTS（门限 500 B）」，运行到 1.3 ms。',
        '从 718 µs 的 RTS 开始，逐帧读出时刻、长度与 Duration，并看 Hidden B 的泳道在哪一帧之后出现预约。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一次受保护的交换中各设备发送的帧', spec: rtsCtsSequence(), caption: '虚线表示 Hidden B 收不到 RTS；CTS 两端都收得到，它为 Hidden B 预约了 424 µs。' },
        { kind: 'table', heading: '718 µs 那次交换的逐项数值', head: ['步骤', '数值'], rows: [
          ['Hidden A 待发的那一帧', '1500 + 24 + 4 = 1528 B'],
          ['与门限比较后，发送 RTS 于', '718 µs · RTS · 20 B'],
          ['RTS 的 Duration，自 RTS 结束起算', '3 × 16 + 28 + 364 + 28 = 468 µs'],
          ['RTS 到达 Hidden B 处', '−83.4 dBm < −82 dBm ✗'],
          ['接入点回复 CTS 于', '762 µs · CTS · 14 B'],
          ['CTS 的 Duration', '468 − 16 − 28 = 424 µs'],
          ['CTS 到达 Hidden B 处', '−60.6 dBm > −82 dBm ✓'],
          ['Hidden B 冻结在 13，NAV 设到', '790 + 424 = 1214 µs'],
          ['确认帧结束于', '1214 µs'],
          ['Hidden B 等待一个 DIFS 后继续递减', '1248 µs · 13'],
        ] },
      ],
      expect: 'RTS 到达 Hidden B 处低于门限，B 的计数照常递减；CTS 一到，B 在 13 冻结，NAV 一直到 1214 µs，正是确认帧结束的时刻；一个分布式帧间间隔（DCF interframe space, DIFS）之后，B 在 1248 µs 从 13 继续。',
      meaning: '两帧的 Duration 照 §9.3.1.2 与 §9.3.1.3 计算（② 照标准）；起作用的是 CTS（① §10.3.1）。预约恰好在确认帧结束的时刻到期，是因为本仿真器以纳秒计、不取整（② Duration 的单位与取整）。',
    },
    {
      heading: '关闭与开启的对比',
      jump: 0,
      more: [0],
      steps: [
        '载入本课场景，跳到第一次碰撞，运行 300 ms；再载入「开启 RTS/CTS（门限 500 B）」运行 300 ms。',
        '在检视器的 BSS 总览里读出两次运行的碰撞次数、涉及数据帧的碰撞次数与送达的帧数。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的 300 ms：关闭与开启', head: ['300 ms 内的统计', '关', '开'], rows: [
          ['碰撞次数', '126', '32'],
          ['其中涉及数据帧的', '126', '7'],
          ['成功送达的数据帧', '45', '329'],
        ] },
      ],
      expect: '涉及数据帧的碰撞减少约 94%，送达的帧数是原来的七倍；碰撞约为每 100 ms 42 次与 11 次。',
      meaning: '这就是 §10.3.1 说的那种情况：两台站点都收得到接入点、彼此收不到。代价是每个数据帧之前多一次 20 字节的 RTS 与 14 字节的 CTS（①）。',
    },
    {
      heading: '剩下的碰撞',
      variant: 0,
      steps: [
        '载入「开启 RTS/CTS（门限 500 B）」，运行 300 ms。',
        '逐一查看剩下的碰撞，读出相撞的是哪两种帧；再统计 Hidden B 设置 NAV 的次数与 CTS 超时的次数。',
      ],
      expect: '32 次碰撞中 25 次是两个 RTS 相撞：两台站点的计数在相隔不超过四个时隙（slot time）的时间内先后归零。另外 7 次涉及数据帧，每一次都有一个 RTS 与它相叠。300 ms 内 Hidden B 依据 CTS 设置了 245 次 NAV；两台站点共有 67 次 CTS 超时。',
      meaning: 'RTS/CTS 不消除碰撞，只把存在风险的时间缩短到一个 RTS 的长度。RTS 失败后发送方在 CTS 超时到期时重新退避（① §10.3.2.9）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.1（RTS/CTS 的作用与开销）、§10.3.5（dot11RTSThreshold 与数据帧在 CTS 之后一个 SIFS 发送）、§9.3.1.2 与图 9-41（RTS 的格式与 Duration）、§9.3.1.3 与图 9-42（CTS 的格式与 Duration）、§10.3.2.9（回复 CTS 的条件、CTS 超时）、§10.3.2.4（NAV 的更新与依据 RTS 的复位）、§10.6.6.2 与 §10.6.6.5.2（RTS 与 CTS 的速率）、§17.3.10.6.1（判忙门限）。',
    '本仿真器的取值与取法：3000 B 与 500 B 两个门限、不设基本速率集、以纳秒计的 Duration、硬门限与墙体损耗。上面每一个计数和时刻都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么真正起作用的是接收方的 CTS，而不是发送方的 RTS？',
      options: [
        '它用更大的功率发送',
        '它由接入点发出，两台隐藏站点都能收到，而它的 Duration 覆盖了尚未开始的那段交换',
        '它更短，所以不容易发生碰撞',
      ],
      answer: 1,
      explain: 'RTS 只能到达发送方本来就能覆盖的站点；CTS 能到达的，恰恰包括发送方覆盖不到的那些站点，而碰撞的风险正来自那里（§10.3.1）。',
    },
    {
      q: '门限从 3000 字节调到 500 字节，房间里发生了什么变化？',
      options: [
        '没有任何变化，帧仍是 1528 字节',
        '每一帧都先发送 RTS，涉及数据帧的碰撞从 126 次降到 7 次',
        '短帧也要先发送 RTS，开销翻倍',
      ],
      answer: 1,
      explain: '帧长大于门限，每一帧都要先进行一次 RTS/CTS 交换（§10.3.5），这就是它的开销。',
    },
    {
      q: 'CTS 的 Duration 怎样计算？',
      options: [
        '等于 RTS 的 Duration',
        'RTS 的 Duration 减去一个 SIFS 与 CTS 自身的时长',
        '数据帧加确认帧的时长',
      ],
      answer: 1,
      explain: '§9.3.1.3：468 − 16 − 28 = 424 µs，预约的终点与 RTS 的相同。',
    },
  ],
}
