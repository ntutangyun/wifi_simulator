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
      { label: '等回答', spans: [{ fromUs: 248, toUs: 293, label: '45 µs' }] },
      { label: '重来', spans: [{ fromUs: 293, toUs: 327, label: 'DIFS' }] },
    ],
    axis: { fromUs: 0, toUs: 360, ticks: [0, 100, 200, 300], unit: 'µs' },
  }
}

export const collisionsCw: Lesson = {
  id: 'collisions-cw',
  module: 3,
  title: '沉默、期限，和被拉宽的窗口',
  why: '两台站点（station, STA）各抽各的数，没有任何机制拦着它们抽到同一个；本轮仿真开头，它们甚至一个数都没抽就同时发了出去。两帧重叠在空中，可两个发送方什么都没察觉——无线电在发送时听不见别人。它们最先得知的事情，是自己等的那个回答没来。这一课讲的就是这之后的两件事：一个期限，和一个被拉宽的抽签范围。',
  outcomes: [
    '解释发送方是怎么发现一次它根本听不见的碰撞的',
    '把 45 µs 的期限拆成三段，并说出每段盖住了什么',
    '说清把竞争窗口（contention window, CW）翻倍买到了什么、付出了什么',
  ],
  needs: ['backoff'],
  terms: [
    { term: 'ACK timeout', plain: '过了这个期限，发送方就判这一帧已经丢了' },
    { term: 'retry', plain: '同一份载荷的又一次尝试；帧头里有一位专门标它' },
    { term: 'CW', plain: '竞争窗口：抽随机数时的取值上限，每失败一次就被拉宽一倍' },
  ],
  picture: [
    { heading: '当两个计数同时归零', text: '没有任何机制能阻止两台站点抽到同一个数。一旦抽到，两边的计数在同一个空闲时隙（slot time）同时归零，两帧一起发出去，彼此重叠。而本轮开头那一次更干脆：两台站点都发现信道空着，都走完了一个长度为零的间隙，于是连抽都没抽就同时开了口。' },
    { kind: 'watch', jump: 0, heading: '去看一次碰撞', text: '载入仿真，跳到第一次碰撞。两个数据帧（data frame）在 0 µs 同时开始、248 µs 同时结束；在红色刻度处，接入点（access point, AP）报告说这两帧它一个都没锁定。' },
    { heading: '沉默需要一个期限', text: '发送方在自己这帧结束的那一刻起表。如果回答真在路上，到这时候早该被察觉了：接收端理应先停的那一小段、再多给一个时隙以防回答开口晚了一点、再加上无线电察觉“有信号开始了”所需的时间。过了这个点还是一片安静，这一帧就被判丢失：站点必须重走一个分布式帧间间隔（DCF interframe space, DIFS），再从头来一次。' },
    { kind: 'watch', jump: 1, heading: '再看那次重传', text: '跳到第一次重传（retry）。检视器里两台站点的竞争窗口都已经是 31，而这一帧的帧头（MAC header）里多了一位重发比特（Retry bit）。' },
    { heading: '把窗口翻倍', text: '拿同样宽的范围再抽一次是没有道理的：碰撞本身就是证据，说明抢的人太多、范围太小。所以失败过的站点把自己抽签范围的上限——竞争窗口——放宽一倍，再失败就再放宽一倍。等待变长，要多花空口时间（airtime），但两个人抽到同一个数的概率会迅速下降。下一次成功之后，窗口立刻弹回最小值。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '本轮仿真的第一次碰撞，按比例画',
      spec: collisionTiming(),
      caption: '两条泳道一模一样，到纳秒都一样——这就是这个模型里的“碰撞”。45 µs 的期限在 293 µs 到期，两边的窗口在同一刻翻倍到 31，各走一个 DIFS 到 327 µs 才重新抽：STA-1 抽到 22、STA-2 抽到 19，于是 STA-2 在 498 µs 先开口，STA-1 正好冻在两者之差 3 上。',
    },
    { kind: 'table', heading: '那个期限为什么落在这里', head: [
      '组成', 'µs', '它盖住了什么', '出处',
    ], rows: [
      ['SIFS', '16', '接收端在回答之前理应先停的那一段', '§17.4.4'],
      ['一个时隙', '9', '开口晚了一点的回答', '§17.4.4'],
      ['信号检测时延（aRxPHYStartDelay）', '20', '无线电察觉“有信号开始了”所需的时间', '§17.4.4'],
      ['ACK 超时（ACK timeout）', '45', '过了这里，这一帧就算丢了', '§10.3.2.9'],
    ] },
    { kind: 'steps', heading: '一次失败之后，站点做什么', items: [
      '发送方在自己这帧结束的那一刻起表，期限是 16 + 9 + 20 = 45 µs。',
      '期限之前没有任何回答开始，这次尝试就判失败：这一帧的重传次数加一。',
      '站点把窗口放宽到“CW 的两倍再加一”，上限是 1023——于是 15、31、63，一路往上。',
      '然后它照常欠一段间隙，并在间隙走完时从新的、更宽的窗口里抽一个数。注意这段间隙是从期限到期那一刻起算的，不是从碰撞帧结束那一刻。',
      '连续失败到第七次，这一帧就被放弃：站点不再重传它，窗口也为接下来的事回到下限。这一句话能成立，是因为两个计数器在这里步调一致：一个是这一帧自己的尝试次数，一个是这条队列（queue）连续失败的次数；它们分家的那一刻，后面的课会拿一次仿真指给你看。',
      '一次成功之后，失败计数归零，窗口回到下限。',
    ] },
    { kind: 'table', heading: '翻倍在本轮里管用吗', head: [
      '窗口', '300 ms 内的抽取次数', '平均抽到的时隙数',
    ], rows: [
      ['CW = 15', '770', '7.15'],
      ['CW = 31', '89', '16.07'],
      ['CW = 63', '5', '23.80'],
    ] },
    { heading: '出错的频率', text: '300 ms 里这两台站点一共发出 864 帧，碰撞 47 次——大约二十次里错一次。翻倍是管用的：整轮下来只有五次抽取来自宽达 63 的窗口，一次也没走到 127。代价也看得见：从 31 抽出来的平均等待是 16.07 个时隙，比从下限抽的 7.15 个多了一倍有余。' },
  ],
  deeper: [
    { heading: '为什么 AP 什么都没看到', text: 'AP 当时并没有在发送，可它也没有收到一帧乱码。无线电只有在某个前导码（preamble）比空中其余一切都高出一定余量时，才会锁定那一帧。这里两个前导码在同一瞬间、以相近的强度开始，互相淹没，于是 AP 根本没有启动任何接收，只记录下信道上有能量。' },
    { heading: '所以这里从来不会有 EIFS', text: '扩展帧间间隔（extended interframe space, EIFS）那段长长的惩罚等待，只有在“接收真的开始了、随后校验失败”时才会启动。压根没锁定过任何前导码的站点，没有任何东西可以失败，也就不欠这一段。整轮仿真里一个 EIFS 都没有启动过；重传前的 DIFS 是从 293 µs 超时结束那一刻起算的，而不是从 248 µs 碰撞帧结束那一刻。' },
  ],
  sources: [
    '确认帧（acknowledgement, ACK）的期限见 IEEE Std 802.11-2024 的 §10.3.2.9：aSIFSTime + aSlotTime + aRxPHYStartDelay，在这里就是 16 + 9 + 20 µs。',
    '每失败一次窗口翻倍见 §10.3.4.3；aCWmin 15、aCWmax 1023 与 dot11ShortRetryLimit 7 见 §17.4.4 与 §10.3.4.4：15 → 31 → 63 → … → 1023。',
    '“两个重叠前导码里无线电锁住哪一个”所用的捕获余量，是本仿真器的模型取值；随机种子、两台饱和站点与 1528 字节的帧同样如此，上面每一个计数都可由场景的种子复现。',
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
    '红色刻度处，AP 泳道上的重叠部分打着斜线并标着“未检测到”。之后两台站点的 CW 都变成 31，每个重传帧都带着 Retry 标志。',
    '跳到约 8.1 ms 处的第二次碰撞，往回步进：两个计数器在同一个时隙同时归零。碰撞在发生之前就已经注定了。',
  ],
  tryThis: [
    '在第一次碰撞的帧尾暂停，用微秒按钮一步步走到 293 µs。空口上什么也没有发生——而这段安静，正是发送方唯一能拿到的“失败”信号。',
  ],
  quiz: [
    {
      q: '站点是怎么发现自己那一帧碰撞了的？',
      options: [
        '它在发送时听到了干扰',
        '回答一直没来，等它的那个期限到期了',
        'AP 广播了一条碰撞通知',
      ],
      answer: 1,
      explain: '无线电边说边听是做不到的。正因如此，这套机制是“碰撞避免（collision avoidance）”，而不是“碰撞检测”。',
    },
    {
      q: '为什么每失败一次就要把窗口翻倍？',
      options: [
        '为了惩罚行为不端的站点',
        '竞争者越多碰撞越多；把抽值摊到更宽的范围上，能把它们重新分开',
        '为了给站点省电',
      ],
      answer: 1,
      explain: '没人知道到底有多少台站点在抢，所以窗口只能用笨办法去学：每失败一次变宽，每成功一次弹回去。',
    },
  ],
}
