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
  why: '空口上没有集中的仲裁者，也没有规定发送顺序的名单。站点（station, STA）能自行决定的只有一件事：开始发送之前，要求信道保持空闲多长时间。让一部分站点要求的空闲时间短一些、另一部分长一些，就形成了优先级——不需要任何消息，也不需要任何调度器。这个房间里有两种间隔：短帧间间隔（short interframe space, SIFS）是一次交互内部的间隔，刚好够接收端的射频从接收状态切换到发送状态，每个数据帧（data frame）的确认帧（acknowledgement, ACK）都恰好在帧尾之后隔这么久开始发送；分布式帧间间隔（DCF interframe space, DIFS）是短帧间间隔再加两个时隙（slot time），是想开始一次新发送的站点必须先侦听到的空闲时间。需要发送应答的接收端根本不参与竞争，而等待 DIFS 的站点还差两个时隙，所以新的竞争者永远无法抢在应答之前发送。已经过去的空闲时间也计入在内：从未侦听到介质（medium）忙的站点，所要求的空闲时间早已满足，第一帧立即发出，连随机等待都不抽取；如果间隔进行到一半被打断，这段间隔就作废，下次要重新开始，并且先抽取一个随机等待。还有更长的第三种间隔，只在站点未能解码一帧时才需要等待，这个房间里一次也没有出现。',
  outcomes: [
    '说出这两种间隔各有多长，以及每一种间隔之后谁可以发送',
    '在时间轴上测量一帧与其应答之间的间隔',
    '解释为什么新的竞争者永远无法抢在确认帧（acknowledgement, ACK）之前发送',
  ],
  needs: ['airtime'],
  terms: [
    { term: 'slot', plain: '计量较长等待时间的单位：足以让信号穿过房间并被检测到' },
    { term: 'SIFS', plain: '短帧间间隔：一次交互内部的间隔，应答在这一间隔之后发出' },
    { term: 'DIFS', plain: '分布式帧间间隔：想开始一次新发送的站点必须先侦听到的、更长的空闲时间' },
  ],
  picture: [
    { heading: '短帧间间隔：完成已经开始的交互', text: '一次交互不止一帧：数据帧（data frame）发出后，经过很短的时间应答就会返回。这段很短的时间就是短帧间间隔（short interframe space, SIFS），整个协议中最短的一种等待——刚好够接收端的射频从接收状态切换到发送状态。正因为它最短，已经处于一次交互中的站点，总能在其他站点还没有资格判断“是否可以发送”之前就再次发送。' },
    { kind: 'watch', jump: 1, heading: '逐步查看短帧间间隔', text: '载入仿真，跳到第一个确认帧，用微秒按钮逐步后退：从数据块结束到应答开始，中间没有任何发送。测量这段时间。' },
    { heading: '较长的间隔：争取一次新的发送机会', text: '有新数据要发送的站点并不是在延续某次交互，所以它必须等待更长的时间：分布式帧间间隔（DCF interframe space, DIFS），即短帧间间隔再加两个时隙（slot time）。多出的这两个时隙，就是保证它不干扰正在进行的交互的额外等待——等它侦听到足够长的空闲、终于获准发送时，应当返回的应答早已返回。' },
    { kind: 'watch', jump: 2, heading: '再查看较长的间隔', text: '跳到第一次退避（backoff）抽取。它前面那段空闲就是 DIFS：站点要等这段间隔结束，才开始倒计数。' },
    { heading: '还有第三种间隔，但这个房间里没有出现', text: '开始接收、却未能解码那一帧的站点，需要等待的是第三种、也是最长的一种间隔：扩展帧间间隔（extended interframe space, EIFS）。这里的每一帧要么被完整正确地接收，要么根本没有被检测到，所以它一次也不会启动，留到有相应记录可看的那一课再讲。' },
  ],
  numbers: [
    { kind: 'table', heading: '两种等待及其单位', head: [
      '间隙', '时长', '之后谁可以发送', '出处',
    ], rows: [
      ['slot', '9 µs', '较长的等待都由它组成', '§17.4.4'],
      ['SIFS', '16 µs', '只有正在进行的那次交互', '§17.4.4'],
      ['DIFS', '34 µs = SIFS + 2 个时隙', '任何想要新的发送机会的站点', '§10.3.2.3.5'],
    ] },
    {
      kind: 'diagram', heading: '本轮仿真的第一个回合（按比例绘制）',
      spec: ifsTiming(),
      caption: '两条深色的段就是本课的内容：16 µs 与 34 µs。帧在 248 µs 结束，应答在一个 SIFS 之后开始、292 µs 结束；DIFS 从那里持续到 326 µs，站点到这一刻才抽取自己的随机等待——这次抽到 11 个时隙，因此下一帧在 425 µs 开始。本轮 254 个应答，每一个都在帧尾之后 16 µs 开始。',
    },
    { kind: 'steps', heading: '站点如何判定自己可以发送', items: [
      '只有在有数据要发送时，它才进行这一判定。第一项检查是介质（medium）：忙，指的是它自己的侦听结果显示有能量，或者它记录的某个预约倒计时尚未结束。只要满足其中一条，这次尝试立即被推迟。',
      '介质空闲时，站点确定自己需要等待哪一种间隔。通常是 DIFS；只有在上一次开始的接收最终未能解码时，需要等待的才换成更长的 EIFS，而且一直如此，直到它自己发送一帧为止。',
      '已经过去的空闲时间计入在内。间隔结束于两者中较晚的一个：当前时刻，或者“介质上一次变为空闲的时刻加上这段间隔”。从未侦听到介质忙的电台视为一直空闲，因此它这段间隔的长度为零。',
      '如果这段间隔完整结束、中途没有被打断，而且这次尝试从未被推迟，站点就立即发送，连随机等待都不抽取。这称为基本接入（basic access）。',
      '间隔尚未结束时，如果介质变忙，这段间隔就作废，这次尝试被标记为“推迟过”。等介质下一次变为空闲，整段间隔要重新开始——而且这一次，发送之前必须先抽取一个随机等待。',
      '交互内部的应答不经过上面任何一步。需要发送 ACK 的接收端根本不参与竞争：它在帧结束后一个 SIFS 就发送应答，无论其他站点倒计数到哪里。',
    ] },
  ],
  limits: [
    { kind: 'unmodelled', text: '两种间隔都是理想值：16 µs 与 34 µs 是 phy.ts 里的常数，由一个全局事件队列按纳秒排定（mac.ts 的 beginIfsAc），场景中所有站点共用同一个时基。真实设备各自按带有几十 ppm 偏差的本地时钟计时，测得的长度每次都略有不同，两台设备对「同一个时隙边界」的判断也不会在同一纳秒。' },
    { kind: 'unmodelled', text: '侦听状态的切换没有检测时延：一路发射开始的那一纳秒，能收到它的电台就同时变为忙（channel.ts 的 updateAllCca），而标准对空闲信道评估的要求是「最多 4 µs 内报告」。时隙之所以长达 9 µs，一半就是为了覆盖这段时延与传播时延——而传播时延在本引擎中为零。' },
    { kind: 'out-of-scope', text: '34 µs 这个数只对不带业务标记的站点成立：本场景的站点运行的是传统 DCF，使用单一的 DIFS。现在的设备按业务类别分别等待不同长度的 AIFS[AC]，同一个房间里根本不会有两台设备都等待 34 µs——这组按类别区分的等待时间是后面一课的主题。', until: 'edca' },
    { kind: 'model-value', text: '「从未侦听到介质忙就视为一直空闲」是引擎自身的初始约定（lastBusyEndNs 起始于一个远在过去的哨兵值），因此第一帧在 0 µs 发出，第一段间隔长度为零。真实设备开机后要先扫描信道、再完成认证和关联，第一个数据帧之前有几十毫秒的管理帧交互——而引擎中根本没有管理帧。' },
  ],
  sources: [
    'IEEE Std 802.11-2024 的 §17.4.4 给出 20 MHz OFDM PHY 的 aSIFSTime 为 16 µs、aSlotTime 为 9 µs；§10.3.2.3.5 把 DIFS 定义为 SIFS 加两个时隙。',
    '§10.3.2.3.7 把 EIFS 定义为 SIFS + DIFS + 以最低强制速率发完一个确认帧的时间；它在本场景中一次也没有启动，所以那个数值留到有相应记录可看的那一课再讲。',
    '1528 字节的帧、处于饱和状态的上传站点，以及图中的每一个时刻，都是本仿真器的场景，可通过随机种子复现；它们不是标准正文中的数字。',
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
    '在任意一次交互处暂停，逐步查看数据块与应答之间的间隔：每一次都是 16 µs 的空闲。',
    '应答之后的间隔更长：站点在抽取下一次随机等待之前，先要等完一个 34 µs 的 DIFS。观察节点上方的标签如何变化。',
  ],
  tryThis: [
    '把时间轴缩放到约 200 µs 的跨度，用 9 µs 的时隙刻度测量 DIFS。它是一个短帧间间隔加上恰好两个时隙，不会更多。',
  ],
  quiz: [
    {
      q: '为什么 SIFS 比 DIFS 短？',
      options: [
        '为了给应答绝对优先权：等待 DIFS 的站点不可能插入一次正在进行的交互',
        '因为确认帧本身是更短的帧',
        '这只是没有实际意义的历史遗留',
      ],
      answer: 0,
      explain: '这两种长度本身就是优先级机制：短帧间间隔更短，交互总能在其他站点获准发送之前完成。',
    },
    {
      q: '一台刚开机、从未侦听到介质忙的站点，在第一帧之前要等待多久？',
      options: [
        '一个完整的 DIFS，34 µs',
        '零——它所要求的空闲时间，早在它要发送之前就已经满足',
        '一个 SIFS，16 µs',
      ],
      answer: 1,
      explain: '间隔结束于“当前时刻”与“上一次变为空闲的时刻加上这段间隔”中较晚的那个，而对一直空闲的电台来说，两者都已满足。本轮第一帧就在 0 µs 发出。',
    },
  ],
}
