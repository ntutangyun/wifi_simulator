/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · the random draw and the frozen countdown.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says about the DCF
 * backoff: the draw (§10.3.3, Eq. 10-1), counting idle slots and not decrementing through a
 * busy one (§10.3.4.3), the backoff after every transmission (§10.3.4.3) and aCWmin / aSlotTime
 * (Table 17-24). ② what the engine does with each — including where it draws the number
 * (after the DIFS, not at the end of the Ack) and its seeded random stream. ③ three runs.
 *
 * The collision half — the deadline, the doubling window — is `collisions-cw`, on this same
 * scene. The scenario builder is unchanged, so the recorded timeline hash stays identical.
 * Every figure printed below is read back out of the lesson text in tests/course/backoff.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstFreeze, J } from '../lessonKit'

/**
 * The run's own first freeze, to scale. Every instant here is a record of this
 * lesson's base run: BACKOFF_DEC at 480/489/498, BACKOFF_FREEZE at 498 with
 * value 3, the neighbour's TX_START/TX_END at 498/746, the access point's
 * acknowledgement at 762/790, IFS_START 790 → 824, BACKOFF_RESUME at 824 with
 * the same 3, and the three decrements that follow before the frame at 851.
 * `backoff.test.ts` reads each figure back out of this spec.
 */
export function backoffTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 498, toUs: 746, label: '邻居的数据帧' },
        { fromUs: 762, toUs: 790, label: 'ACK' },
        { fromUs: 851, toUs: 870 },
      ] },
      { label: 'STA-1 计数', spans: [
        { fromUs: 480, toUs: 498, label: '5 4 3' },
        { fromUs: 498, toUs: 790, label: '冻结在 3', tone: 'muted' },
        { fromUs: 824, toUs: 851, label: '3 2 1 0', tone: 'accent' },
      ] },
      { label: 'STA-1 间隙', spans: [{ fromUs: 790, toUs: 824, label: 'DIFS' }] },
    ],
    axis: { fromUs: 470, toUs: 870, ticks: [500, 600, 700, 800], unit: 'µs' },
  }
}

export const backoff: Lesson = {
  id: 'backoff',
  module: 3,
  title: '随机选取一个数，只在空闲时隙内递减',
  why: '仅靠等待无法解决竞争：两台站点（station, STA）都在等介质（medium）空闲，就会在同一时刻侦听到空闲、同时开始发送。IEEE 802.11-2024 的分布式协调功能（distributed coordination function, DCF）因此要求站点在推迟之后、以及每次发送之后执行退避（backoff）：在 0 到竞争窗口（contention window, CW）之间均匀地随机选取一个整数，竞争窗口的初始值是 15；介质每空闲满一个 9 µs 的时隙（slot time），计数减一，减到零就发送。时隙内介质一旦变忙，这个时隙就不减；等介质重新空闲满一个分布式帧间间隔（DCF interframe space, DIFS），再从原来的值继续递减。已经等待的时隙不会作废，取值最小的站点先发送，每一轮竞争成功的可能是不同的站点。在本课的房间里，两台站点 300 ms 内从 CW = 15 选取了 770 次，平均 7.15 个时隙，约 64 µs，接近两个 DIFS。',
  outcomes: [
    '按标准说出退避值怎样选取、在什么条件下递减',
    '解释被打断的计数为什么从原来的值继续，并在时间轴上核对',
    '分清本仿真器的退避哪些照标准、哪些是它自己的取法',
  ],
  needs: ['ifs'],
  terms: [
    { term: 'backoff', plain: '获准发送之前必须递减到零的随机空闲时隙数' },
    { term: 'CW', plain: '竞争窗口：随机选取退避值时取值范围的上限' },
  ],
  standard: [
    { heading: '退避值怎样选取（§10.3.3，式 10-1）', text: '退避计数 = Random()：在区间 [0, CW] 上均匀分布的伪随机整数，CW 是 aCWmin 与 aCWmax 之间的整数，初始值为 aCWmin。标准提醒设计者，各站点的随机数流必须统计独立。第 17 章正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（physical layer, PHY） 的 aCWmin 为 15，aCWmax 为 1023（表 17-24），所以初始的取值范围是 0 到 15，共十六个值。' },
    { heading: '何时需要退避（§10.3.3，§10.3.4.3）', text: '站点要发送时发现介质忙，就推迟到介质不间断地空闲满 DIFS（上一次接收出错时为扩展帧间间隔（extended interframe space, EIFS）），然后生成一个随机退避计数；计数器里已经有非零值时不重新生成。发送失败之后也要退避。此外，每发送完一个数据帧（data frame）或管理帧（management frame），都要立即执行一次退避，即使没有别的帧要发；发送成功时这次退避从收到的确认帧（acknowledgement, ACK）结束时开始，竞争窗口先恢复为 aCWmin 再选取。' },
    { heading: '只在空闲时隙内递减（§10.3.4.3）', text: '所有退避时隙都在 DIFS 或 EIFS 之后。站点用载波侦听（carrier sense）检查每一个退避时隙：整个时隙内介质空闲，计数减一；时隙内任何时刻介质变忙，这个时隙不减。之后要等介质再空闲满 DIFS 或 EIFS、再过一个 aSlotTime，才减下一次。计数等于零时开始发送。aSlotTime 为 9 µs（表 17-24）。' },
    { heading: '谁先发送（§10.3.4.3）', text: '多台站点都在推迟、进入随机退避时，选到最小退避计数的站点赢得竞争——前提是各站点侦听到的是同样的介质活动，而隐藏节点（hidden station）与干扰会使这一前提不成立。' },
    { kind: 'steps', heading: '一次退避，按标准：逐步说明', items: [
      '竞争窗口从 aCWmin = 15 开始（§10.3.3）。',
      '需要退避时，站点在 [0, CW] 上均匀地选取一个整数作为退避计数（式 10-1）。',
      '介质空闲满 DIFS 之后，每个整个空闲的 9 µs 时隙使计数减一（§10.3.4.3）。',
      '时隙内介质变忙，这个时隙不减；等介质再空闲满 DIFS 加一个时隙，再减下一次，计数保持原值。',
      '计数等于零时开始发送。发送完之后再执行一次退避，所以站点不能不经退避而连续发送两个数据帧。',
    ] },
  ],
  implementation: [
    { topic: '取值范围', standard: '[0, CW] 上的均匀分布（式 10-1）', sim: '照此选取：CW = 15 时 0 到 15 十六个值都可能出现。', kind: 'faithful' },
    { topic: '随机数', standard: '各站点的随机数流统计独立（§10.3.3 NOTE 1），产生方法未规定', sim: '每个节点一条由场景种子派生的确定性随机数流（splitmix32），同一个场景、同一个种子每次生成同一串数。', kind: 'choice' },
    { topic: '竞争窗口的初始值与时隙', standard: 'aCWmin 15，aSlotTime 9 µs（表 17-24）', sim: '照此取值。', kind: 'faithful' },
    { topic: '空闲时隙递减、忙时不减', standard: '整个时隙空闲才减一；变忙后等 DIFS 加一个时隙再减（§10.3.4.3）', sim: '介质一变忙就取消下一次减一，计数保持原值；重新空闲满 DIFS 后，再过一个时隙减下一次。', kind: 'faithful' },
    { topic: '何时抽取退避值', standard: '发送成功后，退避从确认帧结束时开始，此时设置计数（§10.3.4.3）', sim: '在确认帧之后那个 DIFS 结束时才抽取；空口上的时序与标准相同。', kind: 'differs' },
    { topic: '每次发送之后都退避', standard: '每发送完一个数据帧都执行一次退避，即使没有别的帧要发（§10.3.4.3）', sim: '照此处理：发送之后计数清空，下一次必须重新抽取；队列（queue）为空时退避照样进行，减到零时没有帧就不发送。', kind: 'faithful' },
    { topic: '判忙的时刻', standard: '信号开始后最多 4 µs 内报忙（§17.3.10.6.1）；时隙中含空闲信道评估（clear channel assessment, CCA）时间与空中传播时间（§10.3.7 式 10-3）', sim: '一路发射开始的那一纳秒，能收到它的站点同时判忙；没有传播时延。', kind: 'differs' },
    { topic: '一次竞争发送几帧', standard: '每发送一个数据帧之后都执行一次退避（§10.3.4.3）', sim: '本课的两台站点不为帧标注业务类别，也没有传输机会（transmit opportunity, TXOP），所以一次竞争成功只发送一帧；在传输机会内连续发送多帧是后面一课的内容。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '一次冻结',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次退避冻结；之后接入点（access point, AP）会回复邻居一个确认帧。',
        '逐步向后推进到 STA-1 发出自己的帧，对照下图与下表读出每一个时刻。',
      ],
      blocks: [
        { kind: 'diagram', heading: '本轮仿真的第一次冻结（按比例绘制）', spec: backoffTiming(), caption: '两段计数都很短，冻结的那段很长。' },
        { kind: 'table', heading: '第一次冻结前后', head: ['时刻', '发生了什么', 'STA-1 的计数'], rows: [
          ['480 µs', '一个空闲时隙结束', '5'],
          ['489 µs', '一个空闲时隙结束', '4'],
          ['498 µs', '一个空闲时隙结束；邻居开始发送，计数冻结', '3'],
          ['746 µs', '邻居的数据帧结束', '3'],
          ['790 µs', '接入点的确认帧结束，DIFS 开始', '3'],
          ['824 µs', 'DIFS 结束，计数恢复', '3'],
          ['851 µs', '又过了三个空闲时隙，计数为零，开始发送', '0'],
        ] },
      ],
      expect: '你应该看到：STA-1 的计数在 498 µs 冻结在 3，经过邻居的数据帧、接入点的确认帧与一个 DIFS，到 824 µs 从同一个 3 继续，在 851 µs 发出自己的帧。冻结期间计数一次也没有变化。',
      meaning: '这说明：介质忙的时隙不减，空闲满 DIFS 之后从原值继续（①）；本仿真器判忙没有时延，所以邻居开始发送的同一时刻就冻结（②）。',
    },
    {
      heading: '选取的退避值',
      steps: [
        '载入本课场景，运行 300 ms。',
        '在事件日志里过滤退避抽取记录，统计 CW = 15 时的取值。',
      ],
      expect: '你应该看到：两台站点在 CW = 15 时共选取 770 次，平均 7.15 个时隙，取值从 0 到 15，十六个值都出现过，其中 0 出现 61 次。按每个时隙 9 µs 计，平均等待约 64 µs，接近两个 DIFS。',
      meaning: '这说明：取值在 [0, CW] 上均匀分布（①）；这些确切的计数是本仿真器那条由种子派生的随机数流的结果，换一个种子就会不同（②）。',
    },
    {
      heading: '冻结与恢复成对出现',
      steps: [
        '在同一轮里，依次查看每一条冻结记录与它之后的恢复记录。',
        '再任选一次没有被打断的倒数，数一数抽取之后到发送之间经过了几个时隙。',
      ],
      expect: '你应该看到：300 ms 内共 770 组冻结与恢复，每一组恢复时的值都等于冻结时的值；没有被打断的倒数，从抽取到发送经过的时隙数恰好等于抽到的值。',
      meaning: '这说明：已经等待的时隙不会作废（①）。如果改成被打断就重新选取，总是恰好被打断的站点会一直排在后面。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.3 与式 10-1（随机退避计数、竞争窗口的初始值、随机数流统计独立）、§10.3.4.3（退避过程：空闲时隙递减、忙时不减、每次发送之后都退避、取值最小者先发送）、表 17-24（aCWmin 15、aCWmax 1023、aSlotTime 9 µs）、§17.3.10.6.1（4 µs 内报忙）、§10.3.7 式 10-3（时隙的组成）。',
    '本仿真器的取值与取法：每个节点一条 splitmix32 随机数流、在 DIFS 结束时抽取退避值、判忙没有时延。本轮选取的那些值、770 这个组数，以及图中的每一个时刻，都是本仿真器的场景，可以通过随机种子复现；两台饱和站点与 1528 字节的帧同样如此。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一次退避冻结', firstFreeze),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '其他站点在发送时，一个计数器冻结在 7。恢复时它从几开始？',
      options: [
        '重新随机选取一个数',
        '7——正是它冻结时的值',
        '0，因为等待已经结束了',
      ],
      answer: 1,
      explain: '§10.3.4.3：介质忙的时隙不减，计数保持原值，等介质再空闲满 DIFS 之后继续递减。',
    },
    {
      q: '计数器为什么计数空闲时隙，而不是直接计数微秒？',
      options: [
        '因为微秒太短，硬件来不及计数',
        '因为要等待的是“信道空闲”的时间：空口一忙计数就应停止，而时隙正是判定一次空闲所需的时长',
        '因为标准里没有微秒这个单位',
      ],
      answer: 1,
      explain: '这个数表示“还需要经过多少个空闲时隙才能发送”。忙的时段不计入，所以它不可能是一段实际经过的时间。',
    },
    {
      q: '一台站点刚发送成功，队列里没有别的帧。按标准它还要退避吗？',
      options: [
        '不需要，没有帧就不必退避',
        '需要：每发送完一个数据帧都要立即执行一次退避，即使没有别的帧要发',
        '只有发送失败时才退避',
      ],
      answer: 1,
      explain: '§10.3.4.3 要求每次发送之后都执行退避，所以站点不能不经退避而连续发送两个数据帧。',
    },
  ],
}
