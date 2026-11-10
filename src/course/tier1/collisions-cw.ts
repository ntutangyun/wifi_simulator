/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · the deadline, and the window that doubles.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says about a failed
 * exchange: positive acknowledgement (§10.3.2.2), the AckTimeout (§10.3.2.11, Table 17-24), the
 * window that takes the next value of 2^n − 1 and resets (§10.3.3), the retry counter, the Retry
 * subfield and the retry limit (§10.3.4.4, dot11ShortRetryLimit), and when the backoff after a
 * failure begins (§10.3.4.3). ② what the engine does — including the 5 dB capture margin, the
 * worst-instant interference rule and the receiver that never locks, none of which the standard
 * specifies. ③ four runs.
 *
 * The scene is `backoff`'s, unchanged and undivided (`sameSceneAs: 'backoff'`), so the recorded
 * timeline hash of this id is a copy of `backoff`'s. Every figure printed below is read back out
 * of the lesson text in tests/course/collisions-cw.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstCollision, firstRetry, J } from '../lessonKit'

/**
 * The run's own first collision, to scale: two frames that start at the same
 * instant and end at the same instant, the 45 µs of silence that follows, and
 * the DIFS the retry is counted from. Every figure is a record — the two
 * TX_STARTs at 0, COLLISION and both TX_ENDs at 248, ACK_TIMEOUT and CW_CHANGE
 * at 293, IFS_START running to 327 — and `collisions-cw.test.ts` reads each one
 * back out of this spec.
 */
export function collisionTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: 'STA-1', spans: [{ fromUs: 0, toUs: 248, label: '数据帧', tone: 'accent' }] },
      { label: 'STA-2', spans: [{ fromUs: 0, toUs: 248, label: '数据帧', tone: 'accent' }] },
      { label: '等待应答', spans: [{ fromUs: 248, toUs: 293, label: '45 µs' }] },
      { label: '重新竞争', spans: [{ fromUs: 293, toUs: 327, label: 'DIFS' }] },
    ],
    axis: { fromUs: 0, toUs: 360, ticks: [0, 100, 200, 300], unit: 'µs' },
  }
}

export const collisionsCw: Lesson = {
  id: 'collisions-cw',
  module: 3,
  title: '无应答、超时与竞争窗口翻倍',
  why: '两台站点（station, STA）各自独立选取退避（backoff）值，没有任何机制阻止它们选到同一个值，两帧就会在空中重叠。发送方无法察觉：站点在发送时介质（medium）被视为忙，它收不到其他站点的信号。IEEE 802.11-2024 因此采用肯定确认：发送方等待确认帧（acknowledgement, ACK），等待的期限称为 ACK 超时（ACK timeout），等于短帧间间隔（short interframe space, SIFS）、一个时隙（slot time）与信号检测时延（aRxPHYStartDelay）之和，在 20 MHz 正交频分复用（orthogonal frequency-division multiplexing, OFDM）信道上是 16 + 9 + 20 = 45 µs；期限内没有检测到任何接收开始，就判定这次发送失败。失败一次，这一帧的重传（retry）计数加一，竞争窗口（contention window, CW）取 2^n − 1 序列的下一个值，从 15 依次变为 31、63，直到 1023；退避过程从超时到期时开始，重传帧带重发比特（Retry bit）。重传计数达到上限 7 时这一帧被丢弃，竞争窗口回到 15；发送成功时竞争窗口也回到 15。在本课的房间里，两台站点 300 ms 内发出 864 帧、碰撞 47 次，最宽只用到 CW = 63；从 31 选取的平均退避值是从 15 选取的两倍以上。',
  outcomes: [
    '按标准说出发送方怎样发现一次它无法直接检测到的碰撞',
    '把 45 µs 的期限分解为三段，并说出竞争窗口（contention window, CW）怎样翻倍、何时复位',
    '分清本仿真器的碰撞判决哪些是标准的规定、哪些是它自己的取值与取法',
  ],
  needs: ['backoff'],
  terms: [
    { term: 'ACK timeout', plain: '超过这个期限，发送方就判定这一帧已经丢失' },
    { term: 'retry', plain: '同一份载荷的再次发送；帧头里有专门的一位标记它' },
    { term: 'CW', plain: '竞争窗口：随机选取退避值时的取值上限，每失败一次就扩大一倍' },
  ],
  standard: [
    { heading: '肯定确认（§10.3.2.2，§10.3.2.1）', text: '某些帧要求接收方在帧校验正确时回复确认。发起帧交换的站点收不到预期的确认，就认为出了错——尽管接收方可能已经正确收到，出错的可能是确认帧本身。站点正在发送时，介质被判定为忙，所以发送方无法在发送的同时检测碰撞。' },
    { heading: 'ACK 超时（§10.3.2.11，表 17-24）', text: '发送一个要求确认的 MPDU（MAC protocol data unit）之后，站点从物理层（physical layer, PHY）报告发送结束（PHY-TXEND.confirm）时起等待 AckTimeout = aSIFSTime + aSlotTime + aRxPHYStartDelay。期间物理层没有报告接收开始（PHY-RXSTART.indication），就判定发送失败，并在 AckTimeout 到期时启动退避过程；出现了，就等这次接收结束，再看收到的是不是发给自己的确认帧。第 17 章 OFDM PHY 在 20 MHz 信道上三项分别为 16、9、20 µs，AckTimeout 为 45 µs。' },
    { heading: '竞争窗口（§10.3.3）', text: '一次发送失败使重传计数加一时，竞争窗口取序列里的下一个值，直到 aCWmax 为止；序列是从 aCWmin 开始、依次递增的 2 的整数次幂减 1，即 15、31、63、……、1023。每次成功发送数据帧（data frame）或管理帧（management frame）之后，或者站点的短重传计数达到 dot11ShortRetryLimit 时，竞争窗口恢复为 aCWmin。' },
    { heading: '重传与上限（§10.3.4.4）', text: '站点为每个待发的 MSDU（MAC service data unit）维护一个短重传计数，每失败一次加一，成功时清零。一次或多次失败之后的所有重传都把重发比特置 1。重传一直持续到这个计数等于 dot11ShortRetryLimit 为止，然后放弃重传、丢弃这一帧。dot11ShortRetryLimit 的默认值为 7，即一帧最多发送 7 次（附录 C 的 MIB 定义）。' },
    { heading: '失败之后的退避（§10.3.4.3，§10.3.2.3.7）', text: '需要立即应答的发送失败时，退避过程从 AckTimeout 结束时开始。扩展帧间间隔（extended interframe space, EIFS）只在站点收到出错的 PPDU（PHY protocol data unit） 或校验失败的帧之后使用。' },
    { kind: 'steps', heading: '一次失败之后，按标准：逐步说明', items: [
      '发送方从数据帧发完时起计时，期限是 aSIFSTime + aSlotTime + aRxPHYStartDelay，即 45 µs（§10.3.2.11）。',
      '期限内没有任何接收开始，这次发送判为失败：这一帧的短重传计数加一（§10.3.4.4）。',
      '竞争窗口取下一个值：15 → 31 → 63 → … → 1023（§10.3.3）。',
      '退避过程从期限到期时开始，在新的竞争窗口里重新选取退避值；重传帧的重发比特置 1（§10.3.4.3，§10.3.4.4）。',
      '计数达到 dot11ShortRetryLimit（默认 7）时丢弃这一帧，竞争窗口恢复为 15；发送成功时竞争窗口同样恢复为 15（§10.3.3）。',
    ] },
  ],
  implementation: [
    { topic: 'ACK 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay，从发送结束起算；期间出现接收开始就等接收结束（§10.3.2.11）', sim: '16 + 9 + 20 = 45 µs；期限内任何一路接收开始都取消超时。', kind: 'faithful' },
    { topic: '竞争窗口的序列', standard: '2 的整数次幂减 1，从 aCWmin 到 aCWmax（§10.3.3）', sim: '每失败一次取 2 × CW + 1，上限 1023。', kind: 'faithful' },
    { topic: '重传上限（retry limit）', standard: '短重传计数等于 dot11ShortRetryLimit 时丢弃，竞争窗口复位（§10.3.4.4，§10.3.3）', sim: '一帧失败第 7 次时丢弃，竞争窗口回到 15。', kind: 'faithful' },
    { topic: '重发比特', standard: '重传帧置 1（§10.3.4.4）', sim: '照此设置。', kind: 'faithful' },
    { topic: '成功之后', standard: '竞争窗口恢复为 aCWmin（§10.3.3）', sim: '照此恢复为 15。', kind: 'faithful' },
    { topic: '重传前的等待', standard: '退避过程从 AckTimeout 结束时开始（§10.3.4.3）；等待的 分布式帧间间隔（DCF interframe space, DIFS） 从哪个时刻量起没有单独写明', sim: '从超时到期的时刻起重新等一个 DIFS，再抽取退避值。', kind: 'choice' },
    { topic: '两路信号相叠时接收哪一路', standard: '标准未规定接收机怎样处理重叠的前导码（preamble）', sim: '第二个前导码比正在接收的那一路强 5 dB 以上、而且前一路的前导码尚未结束时才转而接收它；5 dB 取自 ns-3 的默认值。', kind: 'value' },
    { topic: '重叠造成的误码', standard: '标准未规定接收机的判决方法', sim: '用整个接收过程中最强的瞬时干扰与门限比较：只重叠几微秒与完全重叠结果相同，没有纠错编码带来的概率曲线。', kind: 'choice' },
    { topic: '没有锁定的接收与 EIFS', standard: 'EIFS 只在收到出错的 PPDU 或校验失败的帧之后使用（§10.3.2.3.7）', sim: '两个前导码以相近的强度同时到达时，接收端根本不启动接收（记为 RX_MISS），所以没有可以校验失败的帧，也就不启用 EIFS。', kind: 'choice' },
    { topic: '两帧的时间关系', standard: '标准未规定', sim: '全场共用一个纳秒时基，没有传播时延，两帧在接收端同一纳秒开始、同一纳秒结束。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '第一次碰撞',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次碰撞。',
        '用微秒按钮从碰撞帧结束逐步推进到两台站点重新抽取退避值，对照下图读出每一个时刻。',
      ],
      blocks: [
        { kind: 'diagram', heading: '本轮仿真的第一次碰撞（按比例绘制）', spec: collisionTiming(), caption: '两条泳道完全相同，精确到纳秒。' },
        { kind: 'formula', heading: '期限', text: 'AckTimeout = 16 + 9 + 20 = 45 µs      248 + 45 = 293 µs', note: '16 µs 是 aSIFSTime，9 µs 是 aSlotTime，20 µs 是 aRxPHYStartDelay。' },
      ],
      expect: '你应该看到：两个数据帧都在 0 µs 开始、248 µs 结束，接入点（access point, AP）对两帧各记一条 RX_MISS。248 到 293 µs 之间空口上没有任何发送；293 µs 时两台站点同时超时，竞争窗口都变为 31，各等一个 DIFS 到 327 µs 才重新抽取：STA-1 抽到 22，STA-2 抽到 19，于是 STA-2 在 498 µs 先发送，STA-1 冻结在两者之差 3 上。',
      meaning: '这说明：发送方只能从收不到确认帧得知失败，期限按 ① 的 AckTimeout 计算；两台站点在 0 µs 同时发送，是因为本仿真器把开机之前视为早已空闲，两台站点都没有抽取退避值（见上一课）。',
    },
    {
      heading: '重传帧带重发比特',
      jump: 1,
      steps: [
        '跳到第一次重传，在检视器里查看两台站点的竞争窗口。',
        '把鼠标悬停在随后发出的那一帧上，查看帧头（MAC header）里的重发比特。',
      ],
      expect: '你应该看到：293 µs 时两台站点各记一条重传记录，竞争窗口都是 31；STA-2 在 498 µs 发出的帧，重发比特为 1。',
      meaning: '这说明：重传计数加一、竞争窗口取下一个值、重传帧置重发比特，都照 ① 的规则执行（②）。',
    },
    {
      heading: '翻倍在本轮中是否有效',
      jump: 2,
      steps: [
        '载入本课场景，运行 300 ms。',
        '在事件日志里过滤退避抽取记录，按竞争窗口分组统计次数与平均值，再统计碰撞次数。',
      ],
      blocks: [
        { kind: 'table', heading: '300 ms 内三档竞争窗口', head: ['竞争窗口', '选取次数', '平均取值（时隙数）'], rows: [
          ['CW = 15', '770', '7.15'],
          ['CW = 31', '89', '16.07'],
          ['CW = 63', '5', '23.80'],
        ] },
      ],
      expect: '你应该看到：两台站点共发出 864 帧，碰撞 47 次，约每二十帧一次；只有 5 次选取来自 CW = 63，没有一次达到 127，也没有一帧因达到重传上限被丢弃。从 31 选取的平均值 16.07 是从 15 选取的 7.15 的两倍以上。',
      meaning: '这说明：竞争窗口翻倍使两台站点的取值重新错开，代价是更长的平均等待（①）；碰撞的判决方法是本仿真器的取法（②），这些确切的计数也随种子变化。',
    },
    {
      heading: '第二次碰撞',
      steps: [
        '在事件日志里找到第二次碰撞，向前逐步回退。',
        '看两台站点的退避计数在哪一个时隙减到零。',
      ],
      expect: '你应该看到：第二次碰撞在约 8.1 ms 处；两台站点的计数在同一个时隙同时减到零，两帧同时开始。',
      meaning: '这说明：选到同一个值就会碰撞，标准没有任何机制阻止这一点（①）；碰撞在两帧开始之前就已经确定。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.1（站点发送时介质为忙）、§10.3.2.2（肯定确认）、§10.3.2.11（AckTimeout）、表 17-24（aSIFSTime 16 µs、aSlotTime 9 µs、aRxPHYStartDelay 20 µs、aCWmin 15、aCWmax 1023）、§10.3.3（竞争窗口的序列与复位）、§10.3.4.3（失败之后的退避）、§10.3.4.4（重传计数、重发比特、重传上限）、附录 C（dot11ShortRetryLimit 默认值 7）、§10.3.2.3.7（EIFS）。',
    '本仿真器的取值与取法：5 dB 的捕获（capture effect）余量（取自 ns-3）、按最强瞬时干扰判决、前导码不足时不启动接收、重传前从超时到期起等 DIFS、没有传播时延。随机种子、两台饱和站点与 1528 字节的帧同样是本仿真器的场景，上面每一个计数都可由场景的种子复现。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一次碰撞', firstCollision),
    J('第一次重传', firstRetry),
    J('第一次 CW 翻倍', (r) => r.type === 'CW_CHANGE' && r.cw > 15),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '站点如何发现自己那一帧发生了碰撞？',
      options: [
        '它在发送时检测到了干扰',
        '一直没有收到应答，等待应答的期限已经到期',
        'AP 广播了一条碰撞通知',
      ],
      answer: 1,
      explain: '站点发送时介质被视为忙，它无法同时接收。§10.3.2.11：AckTimeout 内没有接收开始，就判定发送失败。',
    },
    {
      q: '为什么每失败一次就要把窗口翻倍？',
      options: [
        '为了惩罚发生过碰撞的站点',
        '竞争者越多碰撞越多；在更宽的范围内选取，能使它们的取值重新错开',
        '为了节省站点的电量',
      ],
      answer: 1,
      explain: '没有站点知道究竟有多少台站点在竞争，所以窗口只能逐步试探调整：每失败一次取下一个值，每成功一次回到 aCWmin。',
    },
    {
      q: '本仿真器里，第二个前导码要比正在接收的那一路强多少才会被转而接收？这个数出自哪里？',
      options: [
        '5 dB，标准 §10.3.2.11 规定',
        '5 dB，本仿真器取自 ns-3 的默认值，标准对此没有规定',
        '20 dB，与能量检测门限（energy detection threshold）相同',
      ],
      answer: 1,
      explain: '标准没有规定接收机怎样处理重叠的前导码；5 dB 的捕获余量是本仿真器的取值。',
    },
  ],
}
