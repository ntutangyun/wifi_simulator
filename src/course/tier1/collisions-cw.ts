/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · the deadline, and the window that doubles.
 *
 * The second half of `backoff`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M4). The
 * parent carried two rules the engine follows — how a station draws and counts,
 * and what it does when the answer never comes — and that second rule is this
 * lesson: the 45 µs deadline, the doubling window, and what the two together
 * cost across 300 ms.
 *
 * The scene is the parent's, unchanged and undivided
 * (`sameSceneAs: 'backoff'`), so the recorded timeline hash of this id is a
 * copy of `backoff`'s rather than a new run. It takes jumps 0, 1 and 3 of the
 * old list (the collision, the retry and the first CW doubling); `backoff`
 * keeps the freeze.
 *
 * `deeper` arrives whole from the parent: both notes — why the access point
 * locked onto neither preamble, and why that means no EIFS is ever armed here —
 * are about the collision, which lives in this half.
 *
 * Every number quoted below is pinned in tests/course/collisions-cw.test.ts.
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
 *
 * Drawing the two senders as separate lanes is the point: they are identical,
 * to the nanosecond, which is what a collision in this model IS.
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
  why: '两台站点（station, STA）各自独立选取退避（backoff）值，没有任何机制阻止它们选到同一个值；本轮仿真开始时，它们甚至没有选取退避值就同时发送了。两帧在空中重叠，但两个发送方都没有察觉——无线电在发送时无法接收其他站点的信号。它们得知传输失败的唯一途径，是没有收到所等待的确认帧（acknowledgement, ACK）。等待多久由一个期限决定，叫 ACK 超时（ACK timeout）：从本帧结束时开始计时，依次包括接收端应答前应有的短间隔、为稍晚开始的应答多留的一个时隙（slot time），以及无线电检测到“有信号开始”所需的时间；到期时仍未检测到任何信号，这一帧就判为丢失。接收端同样什么也没有收到：两个前导码（preamble）同时以相近的强度开始、相互干扰，它一帧也没有锁定，所以也不需要那段只在校验失败后才会出现的更长等待。失败的站点把竞争窗口（contention window, CW）扩大到两倍再加一，从期限到期的时刻起重新等待一个分布式帧间间隔（DCF interframe space, DIFS），再从更宽的范围里随机选取，于是两台站点这次选到不同的值，发送时间错开；连续失败则窗口逐次翻倍，失败到第七次时这一帧被放弃，一旦成功窗口就回到最小值。这个房间里大约每二十帧发生一次碰撞，翻倍是有效的，整轮最宽只用到第三档窗口；代价是从翻倍后的窗口里选取的平均等待时间，比窗口最小时多出一倍以上。',
  outcomes: [
    '解释发送方如何发现一次它无法直接检测到的碰撞',
    '把 45 µs 的期限分解为三段，并说出每段对应什么',
    '说明把竞争窗口（contention window, CW）翻倍带来了什么好处、代价是什么',
  ],
  needs: ['backoff'],
  terms: [
    { term: 'ACK timeout', plain: '超过这个期限，发送方就判定这一帧已经丢失' },
    { term: 'retry', plain: '同一份载荷的再次发送；帧头里有专门的一位标记它' },
    { term: 'CW', plain: '竞争窗口：随机选取退避值时的取值上限，每失败一次就扩大一倍' },
  ],
  picture: [
    { heading: '当两个计数同时归零', text: '没有任何机制能阻止两台站点选到同一个值。一旦选到，双方的计数在同一个空闲时隙（slot time）同时归零，两帧同时发出，彼此重叠。而本轮开始时的那一次更直接：两台站点都发现信道空闲，都经过了一段长度为零的间隔，于是没有选取退避值就同时开始发送。' },
    { kind: 'watch', jump: 0, heading: '观察一次碰撞', text: '载入仿真，跳到第一次碰撞。两个数据帧（data frame）在 0 µs 同时开始、248 µs 同时结束；在红色刻度处，接入点（access point, AP）报告这两帧它一帧也没有锁定。' },
    { heading: '等待应答需要一个期限', text: '发送方从自己这一帧结束的时刻开始计时。如果应答确实已经发出，到期之前就应当被检测到：期限包括接收端应答前应有的短间隔、为防应答开始得稍晚而多留的一个时隙，以及无线电检测到“有信号开始”所需的时间。超过这个时刻仍未检测到任何信号，这一帧就判为丢失：站点必须重新等待一个分布式帧间间隔（DCF interframe space, DIFS），再重新竞争一次。' },
    { kind: 'watch', jump: 1, heading: '再观察那次重传', text: '跳到第一次重传（retry）。检视器里两台站点的竞争窗口都已经是 31，而这一帧的帧头（MAC header）里多了一位重发比特（Retry bit）。' },
    { heading: '把窗口翻倍', text: '在同样大小的范围内再选取一次是不合理的：碰撞本身就表明同时竞争的站点太多、范围太小。所以失败过的站点把自己取值范围的上限——竞争窗口——扩大一倍，再失败就再扩大一倍。等待变长，要多占用空口时间（airtime），但两台站点选到同一个值的概率会迅速下降。下一次成功之后，窗口立即回到最小值。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '本轮仿真的第一次碰撞（按比例绘制）',
      spec: collisionTiming(),
      caption: '两条泳道完全相同，精确到纳秒——这就是这个模型里的“碰撞”。45 µs 的期限在 293 µs 到期，双方的窗口在同一时刻翻倍到 31，各等待一个 DIFS 到 327 µs 才重新选取：STA-1 选到 22、STA-2 选到 19，于是 STA-2 在 498 µs 先发送，STA-1 恰好冻结在两者之差 3 上。',
    },
    { kind: 'table', heading: '这个期限为什么取这个值', head: [
      '组成', 'µs', '对应的内容', '出处',
    ], rows: [
      ['SIFS', '16', '接收端在应答之前应有的间隔', '§17.4.4'],
      ['一个时隙', '9', '稍晚开始的应答', '§17.4.4'],
      ['信号检测时延（aRxPHYStartDelay）', '20', '无线电检测到“有信号开始”所需的时间', '§17.4.4'],
      ['ACK 超时（ACK timeout）', '45', '超过这一时刻，这一帧即判为丢失', '§10.3.2.9'],
    ] },
    { kind: 'steps', heading: '一次失败之后站点的处理步骤', items: [
      '发送方从自己这一帧结束的时刻开始计时，期限是 16 + 9 + 20 = 45 µs。',
      '期限之前没有任何应答开始，这次尝试就判为失败：这一帧的重传次数加一。',
      '站点把窗口扩大到“CW 的两倍再加一”，上限是 1023——依次为 15、31、63，逐级增大。',
      '然后它照常等待一段帧间间隔，并在间隔结束时从新的、更宽的窗口里随机选取一个数。注意这段间隔是从期限到期的时刻起算的，不是从碰撞帧结束的时刻起算。',
      '连续失败到第七次，这一帧就被放弃：站点不再重传它，窗口也为后续的帧回到下限。这句话之所以成立，是因为两个计数器在这里保持一致：一个是这一帧自己的尝试次数，一个是这条队列（queue）连续失败的次数；两者何时不再一致，后面的课会用一次仿真演示。',
      '一次成功之后，失败计数归零，窗口回到下限。',
    ] },
    { kind: 'table', heading: '翻倍在本轮中是否有效', head: [
      '窗口', '300 ms 内的选取次数', '平均取值（时隙数）',
    ], rows: [
      ['CW = 15', '770', '7.15'],
      ['CW = 31', '89', '16.07'],
      ['CW = 63', '5', '23.80'],
    ] },
    { heading: '碰撞的频率', text: '300 ms 内这两台站点一共发出 864 帧，碰撞 47 次——大约每二十次发生一次。翻倍是有效的：整轮只有五次选取来自宽达 63 的窗口，一次也没有达到 127。代价同样明显：从 31 选取的平均等待是 16.07 个时隙，比从下限选取的 7.15 个多出一倍以上。' },
  ],
  deeper: [
    { heading: '为什么 AP 什么也没有收到', text: 'AP 当时并没有在发送，但它也没有收到一帧校验出错的帧。无线电只有在某个前导码（preamble）比空中其余所有信号都高出一定余量时，才会锁定那一帧。这里两个前导码在同一时刻、以相近的强度开始，相互干扰，于是 AP 根本没有启动任何接收，只记录到信道上有能量。' },
    { heading: '所以这里不会出现 EIFS', text: '扩展帧间间隔（extended interframe space, EIFS）那段更长的等待，只有在“接收确实已经开始、随后校验失败”时才会启动。从未锁定任何前导码的站点，没有可以校验失败的接收，也就不需要等待这一段。整轮仿真中没有启动过一次 EIFS；重传前的 DIFS 是从 293 µs 超时结束的时刻起算的，而不是从 248 µs 碰撞帧结束的时刻。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '两帧「完全相同，精确到纳秒」，是因为全场共用一个纳秒时基，而且发射在每个接收端同时开始（channel.ts 的 applyPendingStarts 发生在发送端开始发送的同一时刻）。真实的两台设备时钟各有几十 ppm 的偏差、到接入点的距离也不同，两个前导码总会略有错开，相互干扰的时间范围不像这里这样整齐——这个模型里的「碰撞」是最极端的那一种。' },
    { kind: 'threshold', text: '一次接收用整个接收过程中最强的瞬时干扰与门限比较（resolveLock 使用 maxInterfMw），所以只重叠几微秒的两帧与完全重叠的两帧结果相同。真实系统中纠错编码配合交织，短暂的重叠往往仍可纠正，碰撞因此是一条概率曲线；这里它是一个硬判决，也正因如此本课的计数才这样整齐。' },
    { kind: 'model-value', text: '捕获效应（capture effect）指接收机一旦锁定某个前导码就保持锁定，只有遇到明显更强的前导码时才转而与之同步。本仿真器的捕获余量是一个固定的 5 dB：第二个前导码必须比正在接收的那一帧强 5 dB，而且只有在前一帧的前导码尚未结束时才可能切换锁定（channel.ts 的 CAPTURE_MARGIN_DB 与 captureWindowNs）。这个数取自 ns-3 的默认值——标准对「遇到第二个前导码该怎么办」没有作任何规定，真实芯片的门限与窗口各不相同。' },
    { kind: 'unmodelled', text: '45 µs 的期限精确到纳秒，而且只要有任何一路接收开始就被取消（mac.ts 的 onRxStart 取消超时）。真实设备要在这段时间内完成收发切换与前导码搜索，判定失败的时刻包含各实现自身的余量；而「有信号开始」这个条件在真实射频上也可能被一段与本次交互无关的能量误触发。' },
  ],
  sources: [
    '确认帧（acknowledgement, ACK）的期限见 IEEE Std 802.11-2024 的 §10.3.2.9：aSIFSTime + aSlotTime + aRxPHYStartDelay，在这里就是 16 + 9 + 20 µs。',
    '每失败一次窗口翻倍见 §10.3.4.3；aCWmin 15、aCWmax 1023 与 dot11ShortRetryLimit 7 见 §17.4.4 与 §10.3.4.4：15 → 31 → 63 → … → 1023。',
    '“两个重叠的前导码中无线电锁定哪一个”所用的捕获余量，是本仿真器的模型取值；随机种子、两台饱和站点与 1528 字节的帧同样如此，上面每一个计数都可由场景的种子复现。',
  ],
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
  observe: [
    '红色刻度处，AP 泳道上的重叠部分以斜线标示并标注“未检测到”。之后两台站点的 CW 都变为 31，每个重传帧都带有 Retry 标志。',
    '跳到约 8.1 ms 处的第二次碰撞，逐步回退：两个计数器在同一个时隙同时归零。碰撞在发生之前就已经确定。',
  ],
  tryThis: [
    '在第一次碰撞的帧尾暂停，用微秒按钮逐步推进到 293 µs。空口上没有任何信号——而这段空闲，正是发送方唯一能得到的“失败”信号。',
  ],
  quiz: [
    {
      q: '站点如何发现自己那一帧发生了碰撞？',
      options: [
        '它在发送时检测到了干扰',
        '一直没有收到应答，等待应答的期限已经到期',
        'AP 广播了一条碰撞通知',
      ],
      answer: 1,
      explain: '无线电无法同时发送和接收。正因如此，这套机制是“碰撞避免（collision avoidance）”，而不是“碰撞检测”。',
    },
    {
      q: '为什么每失败一次就要把窗口翻倍？',
      options: [
        '为了惩罚发生过碰撞的站点',
        '竞争者越多碰撞越多；在更宽的范围内选取，能使它们的取值重新错开',
        '为了节省站点的电量',
      ],
      answer: 1,
      explain: '没有站点知道究竟有多少台站点在竞争，所以窗口只能逐步试探调整：每失败一次扩大，每成功一次回到下限。',
    },
  ],
}
