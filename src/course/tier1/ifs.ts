/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · SIFS and DIFS.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M4): one
 * topic — the two waits this scene actually contains — one procedure, one
 * scene.
 *
 * What left, and why:
 *  - **EIFS**, in full: the term, the table row, the paragraph
 *    「惩罚间隙：我听见有东西碎了」, the closing 「这里你看不到的那一种」and the
 *    quiz question that tested it. No station in this scene ever waits one —
 *    the lesson said so itself — so the quiz was grading a rule the reader
 *    never sees. It goes to `edca-cost`, whose scene has the record. What
 *    stays here is one forward pointer (§2, §7.3).
 *  - 「一把梯子，三级台阶」, the three-item list: it re-listed the three rows of
 *    the table under it (§5.3), and the timing figure now draws the ladder as
 *    lengths (§5.4).
 *  - 「完整的一轮，按顺序」, the six-row timetable, and
 *    「这在本轮仿真里换来了什么」, the paragraph that said the same thing in
 *    prose: the timing diagram IS that table, to scale and from the same run
 *    (§5.3, §5.4).
 *  - 「为什么“等”就是全部规则」and 「简单得近乎寒碜」: the first is the `why`
 *    section said a second time at greater length, the second is §5.2.
 *
 * Every number quoted below is pinned in tests/course/ifs.test.ts. The scenario
 * builder is unchanged, so the recorded timeline hash stays identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstData, firstAck, firstBackoffDraw, J } from '../lessonKit'

/**
 * The first turn of this lesson's own run, to scale: the frame, the short gap,
 * the answer, the long gap, and the wait that is drawn only once the long gap
 * is over. Every instant is a record — TX_START/TX_END, IFS_START with its
 * `untilNs`, BACKOFF_DRAW — and `ifs.test.ts` reads each figure back out of
 * this spec and compares it with the run, so the picture cannot drift.
 *
 * The two gaps are drawn `accent` because they are the lesson: 16 µs against
 * 34 µs is the whole priority mechanism, and here it is as two lengths.
 *
 * 292 is deliberately not a tick. `layoutTiming` does not pack axis labels, and
 * at this scale 248 and 292 are 19 units apart with 20-unit labels; the four
 * ticks that remain are the ones the caption names.
 */
export function ifsTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 0, toUs: 248, label: '数据帧' },
        { fromUs: 264, toUs: 292, label: 'ACK' },
        { fromUs: 425, toUs: 440 },
      ] },
      { label: 'SIFS', spans: [{ fromUs: 248, toUs: 264, label: '16 µs', tone: 'accent' }] },
      { label: 'DIFS', spans: [{ fromUs: 292, toUs: 326, label: '34 µs', tone: 'accent' }] },
      { label: '退避', spans: [{ fromUs: 326, toUs: 425, label: '11 个时隙' }] },
    ],
    axis: { fromUs: 0, toUs: 440, ticks: [0, 248, 326, 425], unit: 'µs' },
  }
}

export const ifs: Lesson = {
  id: 'ifs',
  module: 3,
  title: 'SIFS 与 DIFS：两种等待',
  why: '空口上没有裁判，也没有一张“轮到谁”的名单。站点（station, STA）能自己决定的只有一件事：开口之前，坚持要听到多久的“什么都没有”。让一部分站点要求的这段安静短一些、另一部分长一些，优先级就有了——不需要任何消息，也不需要任何调度器。这一课就是这个房间里真正出现的那两段安静。',
  outcomes: [
    '说出这两段安静各有多长，以及每一段之后谁可以发送',
    '在时间轴上量出一帧与它的回答之间的那段间隙',
    '解释为什么新的竞争者永远抢不到确认帧（acknowledgement, ACK）前面去',
  ],
  needs: ['airtime'],
  terms: [
    { term: 'slot', plain: '数较长等待时用的单位：够一个信号穿过房间并被察觉' },
    { term: 'SIFS', plain: '短帧间间隔：一次交互内部的停顿，回答就在这之后过来' },
    { term: 'DIFS', plain: '分布式帧间间隔：想开启一件新事的站点必须先听到的那段更长的安静' },
  ],
  picture: [
    { heading: '短间隙：把已经开始的事做完', text: '一次交互不止一帧：数据帧（data frame）发出去，过一小会儿回答就回来。这一小会儿是短帧间间隔（short interframe space, SIFS），整个协议里最短的一段等待——刚好够接收端的射频从“在听”翻成“在发”。正因为它最短，已经身处一次交互之中的站点，总能在别人连“要不要开口”都还没资格考虑之前就重新上口。' },
    { kind: 'watch', jump: 1, heading: '走过短间隙', text: '载入仿真，跳到第一个确认帧，用微秒按钮往回一步步走：从数据块结束到回答开始，中间什么也没发生。把它量出来。' },
    { heading: '长间隙：请求一个发言机会', text: '手里攥着新东西要发的站点并不是在续接什么，所以它必须等得更久：分布式帧间间隔（DCF interframe space, DIFS），短间隙再加两个时隙（slot time）。多出来的这两个时隙，就是让它不碍事的那点额外等待——等它听够了安静、终于获准开口时，本该回来的那个回答早就回来了。' },
    { kind: 'watch', jump: 2, heading: '再走一遍长间隙', text: '跳到第一次退避（backoff）抽取。它前面那段安静就是 DIFS：站点要等这段安静走完，才开始数数。' },
    { heading: '还有第三种，但不在这个房间里', text: '开始接收、却没能把那一帧解出来的站点，欠的是第三种、也是最长的一种等待：扩展帧间间隔（extended interframe space, EIFS）。这里的每一帧要么被干干净净地听到，要么根本没被听到，所以它一次也不会启动，留给有记录可看的那一课。' },
  ],
  numbers: [
    { kind: 'table', heading: '两种等待，和它们的单位', head: [
      '间隙', '时长', '之后谁可以发送', '出处',
    ], rows: [
      ['slot', '9 µs', '较长等待都是拿它搭出来的', '§17.4.4'],
      ['SIFS', '16 µs', '只有已经在进行的那次交互', '§17.4.4'],
      ['DIFS', '34 µs = SIFS + 2 个时隙', '任何想要新发言机会的站点', '§10.3.2.3.5'],
    ] },
    {
      kind: 'diagram', heading: '本轮仿真的第一个回合，按比例画',
      spec: ifsTiming(),
      caption: '两条深色的段就是这一课：16 µs 对 34 µs。帧在 248 µs 结束，回答在一个 SIFS 之后开始、292 µs 结束；DIFS 从那里走到 326 µs，站点到这一刻才抽取自己的等待——这次抽到 11 个时隙，于是下一帧落在 425 µs。本轮 254 个回答，个个都在帧尾之后 16 µs 开始。',
    },
    { kind: 'steps', heading: '站点怎么判定自己可以开口', items: [
      '只有手里有东西要发时，它才问这个问题。第一道测试是介质（medium）：忙，指的是它自己的侦听报告有能量，或者它挂着的某个预约倒计时还没走完。只要占上一条，这次尝试当场被推迟。',
      '介质空着，站点就算出自己欠哪一段间隙。通常是 DIFS；只有上一次开始的接收最后没能解出来时，欠的才换成那段更长的 EIFS，而且一直欠着，直到它自己发出点什么为止。',
      '已经过去的那段安静是算数的。间隙结束于两者中较晚的一个：此刻，或者“介质上一次安静下来的时刻加上这段间隙”。从来没听见介质忙过的电台算作一直空闲，于是它这段间隙的长度是零。',
      '如果这段间隙一路走到头、中途没被打断，而且这次尝试一次也没被推迟过，站点就立刻发送，连随机等待都不抽。这叫基本接入（basic access）。',
      '间隙还在走时，谁把介质弄忙了，这段间隙就作废，这次尝试被记上“推迟过”。等介质下一次安静下来，整段间隙要重走一遍——而且这一次，开口之前必须先抽一个随机等待。',
      '交互内部的那个回答，上面每一步都不走。欠着一个 ACK 的接收端根本不参与竞争：它在帧结束后一个 SIFS 就把回答送上空口，别人数到哪儿都不管。',
    ] },
  ],
  sources: [
    'IEEE Std 802.11-2024 的 §17.4.4 给出 20 MHz OFDM PHY 的 aSIFSTime 为 16 µs、aSlotTime 为 9 µs；§10.3.2.3.5 把 DIFS 定义为 SIFS 加两个时隙。',
    '§10.3.2.3.7 把 EIFS 定义为 SIFS + DIFS + 以最低强制速率发完一个确认帧的时间；它在本场景里一次也没有启动过，所以那个数值留给有记录可看的那一课。',
    '1528 字节的帧、处于饱和状态的上传站点，以及图里的每一个时刻，都是本仿真器的场景，靠随机种子可以复现；它们不是标准正文里的数字。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
    J('第一次退避抽取', firstBackoffDraw),
  ],
  observe: [
    '在任意一次交互处暂停，走过数据块与回答之间的间隙：每一次都是 16 µs 的“什么也没有”。',
    '回答之后的间隙更长：站点连下一次等待都还没抽，先要走完一个 34 µs 的 DIFS。看节点上方的标签怎么变。',
  ],
  tryThis: [
    '把时间轴缩放到约 200 µs 的跨度，拿 9 µs 的时隙刻度去量 DIFS。它是一个短间隙加上恰好两个时隙，绝不会更多。',
  ],
  quiz: [
    {
      q: '为什么 SIFS 比 DIFS 短？',
      options: [
        '为了给回答绝对优先权：等着 DIFS 的人不可能插进一次已经在进行的交互',
        '因为确认帧本身是更短的帧',
        '这只是没什么道理的历史遗留',
      ],
      answer: 0,
      explain: '这两段长度本身就是优先级机制：短间隙更短，交互总能在别人获准开口之前先完成。',
    },
    {
      q: '一台刚开机、从来没听见介质忙过的站点，在第一帧之前要等多久？',
      options: [
        '一个完整的 DIFS，34 µs',
        '零——它要求的那段安静，早在它想发送之前就已经过去了',
        '一个 SIFS，16 µs',
      ],
      answer: 1,
      explain: '间隙结束于“此刻”与“上一次安静下来的时刻加上这段间隙”中较晚的那个，而一直安静着的电台两者都已满足。本轮第一帧就落在 0 µs。',
    },
  ],
}
