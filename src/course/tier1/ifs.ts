/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · SIFS and DIFS.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says about the two
 * interframe spaces this scene contains: the IFS family and its purpose (§10.3.2.3.1), SIFS
 * (§10.3.2.3.3) and what it is made of (§10.3.7 Eq. 10-2), the slot (Eq. 10-3), DIFS (§10.3.2.3.5,
 * Eq. 10-6), basic access and the deferral that forces a backoff (§10.3.4.2, §10.3.3), and EIFS
 * (§10.3.2.3.7, Eq. 10-7). ② what the engine does with each — including the zero detection
 * delay, the zero propagation delay and the 「idle since forever」 start. ③ three runs.
 *
 * The scenario builder is unchanged, so the recorded timeline hash stays identical. Every
 * figure printed below is read back out of the lesson text in tests/course/ifs.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstData, firstAck, firstBackoffDraw, J } from '../lessonKit'

/**
 * The first turn of this lesson's own run, to scale: the frame, the short gap,
 * the answer, the long gap, and the wait that is drawn only once the long gap
 * is over. Every instant is a record — TX_START/TX_END, IFS_START with its
 * `untilNs`, BACKOFF_DRAW — and `ifs.test.ts` reads each figure back out of
 * this spec and compares it with the run.
 *
 * 292 is deliberately not a tick: at this scale 248 and 292 are 19 units apart
 * with 20-unit labels.
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
  why: '空口上没有集中的仲裁者。IEEE 802.11-2024 用帧间间隔（interframe space）给出优先级：站点（station, STA）在发送之前，必须侦听到介质（medium）空闲满规定的时间，要求的时间越短，优先级越高。短帧间间隔（short interframe space, SIFS）是一次交互内部的间隔，在 5 GHz 的 20 MHz 信道上为 16 µs，接收端在数据帧（data frame）结束后隔一个 SIFS 发送确认帧（acknowledgement, ACK），不管介质忙闲。分布式帧间间隔（DCF interframe space, DIFS）等于 SIFS 加两个时隙（slot time），即 34 µs，是用分布式协调功能（distributed coordination function, DCF）发送数据帧的站点必须先侦听到的空闲时间。等待 DIFS 的站点比应答方多等两个时隙，所以新的竞争者无法抢在确认帧之前发送。标准的基本接入（basic access）还规定，已经过去的空闲时间计入在内：帧到达时介质空闲、而且从上一次介质忙结束起已经空闲满 DIFS，站点可以立即发送；帧到达时介质忙，就必须先等介质空闲满 DIFS，再执行随机退避（backoff）。接收出错之后要等的是更长的扩展帧间间隔（extended interframe space, EIFS），本课的房间里一次也没有出现。',
  outcomes: [
    '说出 SIFS、时隙与 DIFS 的取值与关系，以及每一种间隔之后谁可以发送',
    '按基本接入的规则判断一帧是立即发送还是先退避',
    '在时间轴上测量一帧与其应答之间的间隔，并说出本仿真器在哪几处与标准不同',
  ],
  needs: ['airtime'],
  terms: [
    { term: 'slot', plain: '计量较长等待时间的单位：足以让信号穿过房间并被检测到' },
    { term: 'SIFS', plain: '短帧间间隔：一次交互内部的间隔，应答在这一间隔之后发出' },
    { term: 'DIFS', plain: '分布式帧间间隔：想开始一次新发送的站点必须先侦听到的、更长的空闲时间' },
  ],
  standard: [
    { heading: '帧间间隔的用途（§10.3.2.3.1）', text: '相邻两个 PPDU（PHY protocol data unit）之间的时间间隔称为帧间间隔。站点用载波侦听（carrier sense）判断介质在规定的间隔内是否空闲。标准定义了多种帧间间隔，用来给接入介质划分优先级；除仲裁帧间间隔（arbitration interframe space, AIFS）外，它们对每种物理层（physical layer, PHY）都是固定值，与发送速率无关。' },
    { heading: '短帧间间隔（§10.3.2.3.3，§10.3.7）', text: 'SIFS 是从上一个 PPDU 结束到下一个 PPDU 前导码（preamble）开始的时间，是不同站点的发送之间最短的间隔。已经占用介质、要完成一次帧交换的站点使用 SIFS；其他站点必须等待更长的空闲时间，所以正在进行的交换优先完成。确认帧、允许发送（clear to send, CTS）帧之前都用 SIFS。它由接收 PHY 时延、媒体访问控制（medium access control, MAC）处理时延与收发切换时间组成（式 10-2），实际间隔偏离标称值不得超过 ±10% × (aSlotTime − aAirPropagationTime)。' },
    { heading: '时隙与 DIFS（§10.3.7，表 17-24，§10.3.2.3.5）', text: '时隙由空闲信道评估（clear channel assessment, CCA）时间、MAC 处理时延、收发切换时间与空中传播时间组成（式 10-3）。DIFS = aSIFSTime + 2 × aSlotTime（式 10-6）。第 17 章正交频分复用（orthogonal frequency-division multiplexing, OFDM）PHY 在 20 MHz 信道上 aSIFSTime 为 16 µs、aSlotTime 为 9 µs（表 17-24），所以 DIFS 为 34 µs。用 DCF 的站点发送数据帧与管理帧（management frame）时使用 DIFS：介质在 DIFS 的时隙边界上空闲、而且退避计数为零，才可以发送。' },
    { heading: '扩展帧间间隔（§10.3.2.3.7，式 10-7）', text: '站点收到一个出错的 PPDU 或校验失败的帧之后，介质变为空闲时要等 EIFS 而不是 DIFS。EIFS = aSIFSTime + DIFS + 以最低强制速率（mandatory rate）发送一个确认帧的时间，留给其他站点去确认那个本站没有收对的帧。' },
    { kind: 'steps', heading: '一个用 DCF 的站点开始一次新发送，按标准：逐步说明', items: [
      '帧到达时，站点用载波侦听判断介质是否忙：物理侦听报忙、网络分配向量（network allocation vector, NAV）不为零，或者本站正在发送，都算忙（§10.3.2.1）。',
      '介质空闲，而且从上一次介质忙结束起已经空闲满 DIFS（上一次接收出错时为 EIFS），退避计数为零，站点立即发送。这是基本接入（basic access，§10.3.4.2）。',
      '介质忙，站点推迟发送，等介质不间断地空闲满 DIFS（或 EIFS），然后生成一个随机退避计数，退避结束才发送（§10.3.3）。',
      '收到需要立即确认的帧的站点不参与这一过程：它在帧结束后隔一个 SIFS 发送确认帧，不管介质忙闲（§10.3.2.11）。',
    ] },
  ],
  implementation: [
    { topic: 'SIFS 与时隙的取值', standard: 'aSIFSTime 16 µs，aSlotTime 9 µs（表 17-24）', sim: '照此取值；每个确认帧都恰好在帧尾之后 16 µs 开始，没有偏差。', kind: 'faithful' },
    { topic: 'DIFS 的取值', standard: 'aSIFSTime + 2 × aSlotTime（式 10-6）', sim: '16 + 2 × 9 = 34 µs。', kind: 'faithful' },
    { topic: 'SIFS 与时隙的组成', standard: '由各段时延相加（式 10-2、式 10-3），各段取值由实现决定（§10.3.7）', sim: '不分解为各段时延，直接用两个常数。', kind: 'choice' },
    { topic: '侦听时延', standard: '信号开始后最多 4 µs 内报忙（§17.3.10.6.1）；时隙中含空闲信道评估时间（式 10-3）', sim: '没有侦听时延：一路发射开始的那一纳秒，能收到它的站点同时变为忙。', kind: 'differs' },
    { topic: '传播时延', standard: '时隙中含空中传播时间（式 10-3，§10.22.5）', sim: '没有传播时延：帧在各接收端与发送端同一纳秒开始。', kind: 'differs' },
    { topic: '已经过去的空闲时间', standard: '从上一次介质忙结束起空闲满 DIFS 即可发送（§10.3.4.2）', sim: '间隔结束于「当前时刻」与「上一次介质忙结束 + DIFS」中较晚的那个。', kind: 'faithful' },
    { topic: '开机之后的第一帧', standard: '标准未规定站点开机之前从未侦听到介质忙时怎样计算空闲时间', sim: '视为早已空闲满 DIFS：第一段间隔长度为零，第一帧在 0 µs 发出，不抽取退避。场景里也没有扫描、认证与关联的管理帧交互。', kind: 'choice' },
    { topic: '推迟之后必须退避', standard: '帧到达时介质忙，空闲满 DIFS 后生成随机退避计数（§10.3.3）', sim: '照此处理：等待间隔时介质变忙，这段间隔作废，下次空闲时重新开始，结束后先抽取退避值。', kind: 'faithful' },
    { topic: 'EIFS', standard: 'aSIFSTime + DIFS + 以最低强制速率发送确认帧的时间（式 10-7）', sim: '16 + 34 + 44 = 94 µs，接收出错后启用；本课的场景里一次也没有启用。', kind: 'faithful' },
    { topic: '业务类别', standard: '支持服务质量（quality of service, QoS）的站点按接入类别（access category, AC）等待各自的仲裁帧间间隔（§10.3.2.3.6）', sim: '本课的站点是 nonht，走 DCF，只用单一的 DIFS；按类别区分的等待是后面一课的内容。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '帧与确认帧之间的 SIFS',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一个确认帧。',
        '用微秒按钮逐步后退到数据帧结束，测量中间没有任何发送的那段时间。',
      ],
      expect: '你应该看到：第一个数据帧 1528 字节，从 0 µs 发到 248 µs；确认帧在 264 µs 开始、292 µs 结束。前 100 ms 里共 254 个确认帧，每一个都在数据帧结束后 16 µs 开始。',
      meaning: '这说明：应答方隔一个 SIFS 就发送，不参与竞争（①）；本仿真器取标称值，没有偏差（②）。',
    },
    {
      heading: 'DIFS 结束才抽取退避',
      jump: 2,
      steps: [
        '跳到第一次退避抽取，看它前面那段空闲有多长。',
        '对照下图读出 DIFS 的起止时刻与抽到的退避值，再算出下一帧开始的时刻。',
      ],
      blocks: [
        { kind: 'diagram', heading: '本轮仿真的第一个回合（按比例绘制）', spec: ifsTiming(), caption: '两条深色的段是本课的两种间隔：16 µs 与 34 µs。' },
      ],
      expect: '你应该看到：确认帧在 292 µs 结束，DIFS 持续到 326 µs，站点在这一刻抽到 11 个时隙，于是下一帧在 326 + 11 × 9 = 425 µs 开始。前 100 ms 里共 254 次抽取，每一次都在一个 34 µs 的 DIFS 结束时；没有一次 EIFS。',
      meaning: '这说明：DIFS 比 SIFS 多两个时隙（①），等待 DIFS 的站点不会打断一次正在进行的交换。每次发送之后都要重新抽取退避值，是下一课的内容。',
    },
    {
      heading: '第一帧为什么在 0 µs 发出',
      jump: 0,
      steps: [
        '跳到第一个数据帧，看它之前的那条间隔记录。',
        '比较这段间隔的起止时刻，再看这一帧之前有没有抽取退避值。',
      ],
      expect: '你应该看到：0 µs 处的 DIFS 记录起止都是 0 µs，长度为零；这一帧之前没有任何抽取记录，帧在 0 µs 发出。整轮只有这一段间隔长度为零。',
      meaning: '这说明：已经过去的空闲时间计入在内，帧到达时介质空闲就是基本接入（①）；把开机之前视为早已空闲满 DIFS，是本仿真器的取法（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.3.1（帧间间隔的用途）、§10.3.2.3.3（SIFS）、§10.3.2.3.5（DIFS）、§10.3.2.3.6（AIFS）、§10.3.2.3.7（EIFS）、§10.3.7 式 10-2、10-3、10-6、10-7（各间隔的组成与关系）、表 17-24（aSIFSTime 16 µs、aSlotTime 9 µs）、§17.3.10.6.1（4 µs 内报忙）。',
    '§10.3.2.1（载波侦听判断介质忙闲）、§10.3.4.2（基本接入）、§10.3.3（推迟之后生成随机退避计数）、§10.3.2.11（确认帧在 SIFS 之后发送，不管介质忙闲）。',
    '本仿真器的取值与取法：没有侦听时延与传播时延、把开机之前视为早已空闲。1528 字节的帧、处于饱和状态的上传站点，以及图中的每一个时刻，都是本仿真器的场景，可通过随机种子复现。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
    J('第一次退避抽取', firstBackoffDraw),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么 SIFS 比 DIFS 短？',
      options: [
        '为了给应答绝对优先权：等待 DIFS 的站点不可能插入一次正在进行的交互',
        '因为确认帧本身是更短的帧',
        '这只是没有实际意义的历史遗留',
      ],
      answer: 0,
      explain: '§10.3.2.3.3：正在完成帧交换的站点用最短的间隔，其他站点要等更长的空闲时间，所以正在进行的交换优先完成。',
    },
    {
      q: '一个帧到达时介质正忙。按标准，站点在介质空闲满 DIFS 之后做什么？',
      options: [
        '立即发送',
        '生成一个随机退避计数，退避结束才发送',
        '再等一个 SIFS',
      ],
      answer: 1,
      explain: '§10.3.3：推迟过的站点在 DIFS 之后还要随机退避；只有帧到达时介质空闲、而且已经空闲满 DIFS，才是基本接入，立即发送。',
    },
    {
      q: '本课的第一帧在 0 µs 发出，之前没有等待。这是哪一方的规定？',
      options: [
        '标准规定站点开机后可以立即发送',
        '标准没有规定开机之前的空闲怎样计算；把它视为早已空闲满 DIFS 是本仿真器的取法',
        '这是 SIFS 的作用',
      ],
      answer: 1,
      explain: '基本接入只要求从上一次介质忙结束起空闲满 DIFS；对从未侦听到介质忙的情形，本仿真器把它当作早已满足。',
    },
  ],
}
