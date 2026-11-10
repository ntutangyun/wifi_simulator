/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · NAV, the reservation a header carries.
 *
 * Standard-first shape (2026-11-11, after the UWB pilot docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① IEEE Std 802.11-2024 on carrier sense (§10.3.2.1), the Duration/ID field (§9.2.4.2,
 * Table 9-9), the Duration a non-QoS Data frame and its Ack carry (§9.3.2.1.5, §9.3.1.4) and the
 * NAV update rule (§10.3.2.4); ② what this simulator does with each of them — including the two
 * places it departs (a nanosecond Duration that is never rounded, one NAV where an HE STA keeps
 * two); ③ three runs of the unchanged scene.
 *
 * Every figure the labs print is read back out of this file by tests/course/nav.test.ts and
 * compared with a run. The scenario builder is unchanged, so the recorded timeline hash stays
 * identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstNav, J } from '../lessonKit'

/**
 * One long freeze, to scale, and the reservation sitting in the middle of it.
 * Every figure is a record of this lesson's base run: BACKOFF_FREEZE for Talker
 * A at 498 with value 3, B's TX_END at 746, the NAV_SET at 746 running to 790,
 * the IFS_START from 790 to 824, and the acknowledgement on the air from 762 to
 * 790.
 *
 * It replaces the three-row table that used to print 248 + 44 + 34 = 326: the
 * table's content was three lengths and a sum, and three lengths side by side
 * are what shows that the middle one is the only one the ear cannot account
 * for. The middle span is left unlabelled on purpose — 44 µs is already the
 * `Duration` lane's own label directly above it, and a second label there
 * cannot fit a 20-unit span without being pushed off the viewBox.
 * `nav.test.ts` reads each figure back out of this spec.
 */
export function navTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 498, toUs: 746, label: 'B 的数据帧' },
        { fromUs: 762, toUs: 790, label: 'ACK' },
      ] },
      { label: 'Duration', spans: [{ fromUs: 746, toUs: 790, label: '44 µs', tone: 'accent' }] },
      { label: 'A 等待的原因', spans: [
        { fromUs: 498, toUs: 746, label: '侦听为忙' },
        { fromUs: 746, toUs: 790, tone: 'muted' },
        { fromUs: 790, toUs: 824, label: 'DIFS' },
      ] },
    ],
    axis: { fromUs: 470, toUs: 840, ticks: [500, 600, 700, 800], unit: 'µs' },
  }
}


export const nav: Lesson = {
  id: 'nav',
  module: 3,
  title: 'NAV——用一个字段预约信道',
  why: '仅凭侦听，站点（station, STA）只能知道空口此刻是否忙；一次帧交换中间的停顿，以及来自本机收不到的设备的应答，侦听都无法预告。IEEE Std 802.11-2024 因此在载波侦听（carrier sense）之外又规定了虚拟载波侦听（virtual carrier sense）：除少数帧外，每一帧的帧头（MAC header）都带一个持续时间（Duration/ID）字段，写明这一帧结束之后本次交换还要占用介质（medium）多少微秒；正确收到这一帧、而接收端地址（receiver address, RA）不是自己的站点，用它更新本地的网络分配向量（network allocation vector, NAV），新值大于当前值时才采用。NAV 未到期，介质就视为忙，与物理载波侦听报忙的效果相同：退避（backoff）计数冻结。不支持服务质量（quality of service, QoS）的站点发出的单播数据帧（data frame），填写一个短帧间间隔（short interframe space, SIFS）加一个确认帧（acknowledgement, ACK）的时长，不包括它自身；确认帧填写 0，表示交换到此结束。本仿真器照此计算和更新 NAV，与标准不同的有两处：Duration 以纳秒记录、不取整到微秒；每台站点只有一个 NAV。本课场景里数据帧填写的都是 16 + 28 = 44 µs，一段较长的冻结由三段组成：邻居的帧在空中，NAV 覆盖其后的停顿与应答，最后是一个分布式帧间间隔（DCF interframe space, DIFS）。',
  outcomes: [
    '说出标准对 Duration 字段与 NAV 的更新规定了什么',
    '分清本仿真器的哪些做法照标准、哪些与标准不同',
    '从日志里读出一次 NAV 设置，并把一段冻结拆成三段',
  ],
  needs: ['backoff'],
  terms: [
    { term: 'Duration', plain: '帧头前部的一个字段：这一帧结束之后本次交换还需要的时长，以微秒计' },
    { term: 'NAV', plain: '网络分配向量：站点本地维护的倒计时，未到期时介质视为忙' },
    { term: 'virtual carrier sense', plain: '依据其他站点在帧中通告的时长判定介质忙，而不是依据本机检测到的信号' },
  ],
  standard: [
    { heading: '两种载波侦听（§10.3.2.1）', text: '介质的忙闲由物理载波侦听与虚拟载波侦听共同决定：任何一个报忙，介质就视为忙，否则视为空闲。物理载波侦听由物理层（physical layer, PHY）提供；虚拟载波侦听就是 NAV，每个媒体访问控制（medium access control, MAC）层都必须提供。NAV 依据帧中通告的持续时间，预测介质今后的占用情况。' },
    { heading: 'Duration/ID 字段（§9.2.4.2，表 9-9）', text: 'Duration/ID 字段长 2 个八位组。用作持续时间时，最高位为 0，其余 15 位给出以微秒为单位的整数，取值 0 到 32 767。算出的时长含有不足 1 µs 的部分时，向上取整（§9.3.2.1.5）。' },
    { heading: '数据帧与确认帧各填多少（§9.3.2.1.5，§9.3.1.4）', text: '不支持服务质量的站点发出的数据帧，若发给单个站点、「更多分片」位为 0，Duration 等于发送一个确认帧所需的时间加一个 SIFS，确认帧的速率按 §10.6 的规则确定；组播数据帧的 Duration 为 0。回复这样一帧的确认帧，Duration 为 0。' },
    { heading: '确认帧的速率（§10.6.6.5.2）', text: '在非 HT 格式中发送的确认帧，主速率取基本速率集（BSSBasicRateSet）中不高于前一帧速率的最高速率；基本速率集中没有这样的速率时，取物理层强制速率（mandatory rate）中不高于前一帧速率的最高速率。20 MHz 信道的强制速率是 6、12、24 Mb/s（表 17-23）。' },
    { heading: 'NAV 怎样更新（§10.3.2.4）', text: '站点在一次接收中收到至少一帧后，可以用其中任何有效的 Duration 更新 NAV：帧的接收端地址等于本站地址时，不更新；对其余的帧，收到的 Duration 大于当前 NAV 时才更新。更新在物理层报告接收结束（PHY-RXEND.indication）时进行。HE 站点维护两个 NAV，按 §26.2.4 分别更新。' },
    { heading: 'NAV 与退避（§10.3.3，§10.3.4.3）', text: '介质忙既可以由物理载波侦听报出，也可以由 NAV 报出。退避中的站点只在一个时隙（slot time）内介质始终空闲时才把计数减一；介质忙过之后，站点要等介质连续空闲一个 DIFS，才继续退避。' },
    { kind: 'steps', heading: '一次数据帧交换中的 NAV，按标准：逐步说明', items: [
      '发送方在帧头的 Duration 字段里写入这一帧结束之后还需要的时间：单播数据帧写入一个 SIFS 加一个确认帧的时长，向上取整到微秒（§9.3.2.1.5）。',
      '其他站点正确收到这一帧，发现接收端地址不是自己，于是在接收结束时比较：帧中的 Duration 大于当前 NAV，就把 NAV 设为它（§10.3.2.4）。',
      'NAV 未到期期间，介质视为忙，不论物理载波侦听的结果如何（§10.3.2.1）；退避计数不再递减（§10.3.4.3）。',
      '接收方在一个 SIFS 之后回复确认帧，Duration 为 0（§9.3.1.4）；0 不大于任何 NAV，不引起更新。',
      'NAV 到期、物理载波侦听也报空闲之后，站点等介质连续空闲一个 DIFS，再继续退避（§10.3.3）。',
    ] },
  ],
  implementation: [
    { topic: '数据帧的 Duration', standard: '一个 SIFS 加一个确认帧的时长（§9.3.2.1.5）', sim: '照此：16 µs 的 SIFS 加 28 µs 的确认帧，本课场景里 200 ms 内的 576 个数据帧都写 44 µs。', kind: 'faithful' },
    { topic: '确认帧的 Duration', standard: '0（§9.3.1.4）', sim: '照此写 0：确认帧的 Duration 按 §9.2.5.6 取被确认那一帧的 Duration 减去一个 SIFS 与确认帧自身，不足 0 时取 0，对这样的数据帧恰好是 0；NAV 只在 Duration 大于 0 时更新。', kind: 'faithful' },
    { topic: '确认帧的速率', standard: '基本速率集中不高于前一帧速率的最高速率，没有时取强制速率（§10.6.6.5.2）', sim: '本仿真器没有基本速率集，相当于取空集：一律在强制速率 6、12、24 Mb/s 中取不高于前一帧速率的最高一档。本课 576 个数据帧中 546 个以 54 Mb/s、30 个以 48 Mb/s 发送，确认帧都是 24 Mb/s、14 个字节、28 µs。', kind: 'value' },
    { topic: 'Duration 的单位与取整', standard: '以微秒为单位的整数，向上取整，最大 32 767（§9.2.4.2，§9.3.2.1.5）', sim: '本仿真器以纳秒整数记录 Duration，不取整到微秒，也不检查上限；NAV 在全局事件队列的那一纳秒到期，全场时钟一致。本课的时长恰好都是整微秒，所以数值与取整后相同。', kind: 'differs' },
    { topic: '哪些帧更新 NAV', standard: '接收端地址不是本站、且 Duration 大于当前 NAV（§10.3.2.4）', sim: '照此：正确解出、发给别的站点的帧才更新 NAV，新的到期时刻晚于当前到期时刻才采用。', kind: 'faithful' },
    { topic: '何时更新', standard: '在接收结束时，用有效的帧（§10.3.2.4）', sim: '照此：在整帧解出的时刻更新；校验失败的帧不更新 NAV。', kind: 'faithful' },
    { topic: '介质忙的判定', standard: '物理载波侦听或 NAV 任一报忙（§10.3.2.1）', sim: '照此：空闲信道评估（clear channel assessment, CCA）报忙，或 NAV 未到期，两者满足其一即为忙。', kind: 'faithful' },
    { topic: 'NAV 与退避', standard: '介质忙时计数不递减，忙过之后先等 DIFS（§10.3.3，§10.3.4.3）', sim: '照此：NAV 一设置，正在递减的计数立即冻结，正在等待的帧间间隔作废；NAV 到期时若侦听为空闲，就开始等 DIFS。', kind: 'faithful' },
    { topic: 'HE 站点的两个 NAV', standard: '非接入点（access point, AP）的 HE 站点维护本基本服务集（basic service set, BSS）内的 NAV 与基本 NAV 两个计时器（§26.2.4）；HE 格式的帧在物理层头部携带的 TXOP_DURATION 也可以更新 NAV（§10.3.2.4）', sim: '未实现：每台站点只有一个 NAV，只从帧中的 Duration 更新。一个场景也只能有一个接入点，编辑器拒绝第二个，所以邻居网络的帧设置的 NAV 在这里无法复现。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '第一次设置 NAV',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次设置 NAV 的时刻。',
        '读出是哪台站点、因为哪一帧设置了 NAV，以及 NAV 设到什么时刻。',
      ],
      expect: 'Talker A 在 746 µs 解出 Talker B 发给接入点的数据帧，把 NAV 设到 790 µs，即 44 µs 之后；这一帧的接收端地址不是 Talker A。',
      meaning: 'NAV 由发给别人的帧设置（① §10.3.2.4，② 照标准）；44 µs 是 B 在 Duration 里写入的时长。',
    },
    {
      heading: '44 µs 的组成',
      steps: [
        '载入本课场景，运行 200 ms。',
        '把鼠标移到任一数据帧上，读出它的 Duration；再读出紧随其后的确认帧的长度、速率与 Duration。',
        '在 Listener 的泳道里任选一条 NAV，核对它的到期时刻与确认帧的结束时刻。',
      ],
      blocks: [
        { kind: 'table', heading: '44 µs 的组成', head: ['组成', '时长', '出处'], rows: [
          ['应答之前的停顿（SIFS）', '16 µs', '§17.4.4'],
          ['确认帧：14 个字节，24 Mb/s', '28 µs', '§17.4.3'],
          ['数据帧填写的值', '44 µs', '§9.3.2.1.5'],
          ['确认帧填写的值', '0 µs', '§9.3.1.4'],
        ] },
      ],
      expect: '200 ms 内 576 个数据帧填写的都是 44 µs；确认帧都是 14 个字节、24 Mb/s、28 µs，Duration 都是 0。Listener 设置了 513 次 NAV，每一次都在确认帧结束的那一纳秒到期，没有一次由确认帧设置。',
      meaning: '数据帧的 Duration 照 §9.3.2.1.5 计算（②）。NAV 恰好在纳秒上到期，是因为本仿真器以纳秒计、不取整，全场时钟一致（② Duration 的单位与取整）；真实设备以微秒计、向上取整，各自的时钟也有偏差。',
    },
    {
      heading: '一段长冻结的分解',
      jump: 0,
      steps: [
        '载入本课场景，用微秒按钮把 Talker A 从 498 µs 逐步推进到 824 µs。',
        '每推进一步，说出 A 此刻处于三段等待中的哪一段：侦听为忙、只有 NAV 为忙、DIFS。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '一段长冻结的分解',
          spec: navTiming(),
          caption: 'A 在 498 µs 冻结，三段合计 326 µs：第一段 248 µs 是 B 的数据帧在空中，中间 44 µs 由 NAV 覆盖，最后 34 µs 是 DIFS。',
        },
      ],
      expect: 'A 在 498 µs 冻结，计数为 3。中间那 44 µs 里，前 16 µs 空口空闲、A 自己的侦听也报空闲，后 28 µs 是接入点的确认帧。到 824 µs 之后，计数从 3 继续，三个时隙之后 A 发送。',
      meaning: '中间那 16 µs 是物理载波侦听覆盖不到、只由 NAV 覆盖的部分（① §10.3.2.1）。A 冻结时并不知道要等多久：要到 746 µs 解出 B 的帧，才得到最早何时恢复的下界。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.1（物理与虚拟载波侦听）、§9.2.4.2 与表 9-9（Duration/ID 字段的编码）、§9.3.2.1.5（不支持服务质量的站点发出的数据帧的 Duration）、§9.3.1.4（确认帧的 Duration）、§10.3.2.4（NAV 的设置与复位）、§10.6.6.5.2 与表 17-23（控制回应帧的速率、强制速率）、§10.3.3 与 §10.3.4.3（退避）、§26.2.4（HE 站点的两个 NAV）、§17.4.4（aSIFSTime 16 µs、aSlotTime 9 µs）、§17.4.3（发送时间的计算）。',
    '本仿真器的取值与取法：不设基本速率集、以纳秒计的 Duration 与 NAV、每台站点一个 NAV。图中 248 µs 的帧、28 µs 的确认帧以及每一个时刻都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Talker A', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'Talker B', 'sta', 6.5, 5, 'nonht', 'saturated'),
    node('sta-3', 'Listener', 'sta', 5, 6.5, 'nonht', 'browsing'),
  ]),
  jumps: [
    J('第一次设置 NAV', firstNav),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '站点用来更新 NAV 的是什么？',
      options: [
        '它测得的信号强度',
        '它正确收到、而且接收端地址不是自己的帧里的 Duration',
        '一个随机的等待时间',
      ],
      answer: 1,
      explain: '§10.3.2.4：帧必须被正确收到；接收端地址等于本站地址时不更新，对其余的帧，Duration 大于当前 NAV 才更新。',
    },
    {
      q: '数据帧填写的 Duration，为什么不包括这一帧自身？',
      options: [
        '因为发送方不知道自己这一帧有多长',
        '因为这一帧还在空中时，物理载波侦听本来就报忙；Duration 覆盖的是这一帧结束之后的部分',
        '因为那个字段太短，无法容纳这个数',
      ],
      answer: 1,
      explain: '§9.3.2.1.5 规定 Duration 是一个确认帧加一个 SIFS 的时长：正是侦听覆盖不到的停顿，以及可能来自本机收不到的设备的应答。',
    },
    {
      q: '哪一项是本仿真器与标准不同的地方？',
      options: [
        '数据帧的 Duration 等于一个 SIFS 加一个确认帧的时长',
        'Duration 以纳秒记录、不向上取整到微秒',
        '接收端地址是自己的帧不更新 NAV',
      ],
      answer: 1,
      explain: '标准的 Duration 是以微秒为单位、向上取整的整数（§9.2.4.2）；本仿真器以纳秒记录。另外两项都照标准。',
    },
  ],
}
