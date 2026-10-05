/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · what the head start costs, and who pays it.
 *
 * The second half of `edca`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8). The
 * parent owns how a win is decided; this lesson owns the bill: what priority
 * cannot do (it never interrupts anything), what the lowest category pays for
 * everyone else's shorter silence, and the one station in this room that ever
 * owes an EIFS.
 *
 * The EIFS material arrives from `ifs` (§2 M4 and §7.3): no station in that
 * lesson's scene ever waits one, so the paragraph, the table row, the term and
 * the quiz question moved to the scene that has the record — this one, where the
 * uploader collects seven of them. Its pin is held in tests/course/ifs.test.ts
 * ("MOVED CLAIM, PIN HELD") until the controller registers this lesson; the same
 * constants are re-pinned in tests/course/edca-cost.test.ts, now beside the run.
 *
 * The scene is the parent's, unchanged and undivided (`sameSceneAs: 'edca'`), so
 * the recorded timeline hash of this id is a copy of `edca`'s rather than a new
 * run. It takes jumps 1 and 2 of the old list (the background station's first
 * frame, the uploader's first EIFS); `edca` keeps the first voice access.
 *
 * The procedure is `beginIfsAc` in src/engine/mac.ts — `corruptLast ? eifsNs -
 * difsNs + aifs : aifs`, §10.23.2.2 — with `EIFS_NS` from src/engine/phy.ts, and
 * the two places the engine clears `corruptLast`: the station's own transmission
 * (line 1037) and the start of a new reception (line 1266).
 *
 * Every number quoted below is pinned in tests/course/edca-cost.test.ts.
 */
import { type Lesson, oneRoom, node, sc, J } from '../lessonKit'

export const edcaCost: Lesson = {
  id: 'edca-cost',
  module: 7,
  title: '优先接入的代价，以及由谁承担',
  why: '上一课的两个数决定了谁先发送，可它们没有多出一微秒空口时间（airtime）。信道还是一条，给了语音的那五个时隙（slot time），必然是从别人那里拿的。这一课我们把代价算清：优先级换不到什么，最低的那一类为此付出了多少，以及这个房间里唯一一台要多等一段的站点（station, STA）——它多等的那一段，是上一课那套规则里唯一一处我们还没看过的分支。',
  outcomes: [
    '解释优先级做不到什么：已经在空中的帧不会被任何东西挤开',
    '读出三台站点各自的抽取次数与排队时延，并说出最低的那一类付出了什么',
    '说出那段更长的等待从哪里来、那 103 µs 是怎么算的，以及谁摊上过它',
  ],
  needs: ['edca'],
  terms: [
    { term: 'EIFS', plain: '扩展帧间间隔：开始接收却没能把那一帧解出来的站点，下一次竞争前要多等的那一段——它的长度正好容下别人的确认帧本该出现的那段时间' },
  ],
  picture: [
    { heading: '优先级不能打断任何东西', text: '先说它做不到的事。已经在空中的帧就是在空中；一帧语音如果赶上别人正发着一长串突发，它就得等那串突发整个结束，和其他任何帧一样。优先级给的是在“下一轮归谁”这场竞争里更靠前的位置，而不是退出这一轮的办法。所以这里的语音平均而言很快，却照样会出现几次明显偏长的时延。' },
    { kind: 'watch', jump: 0, heading: '去看排在最后的那一类', text: '载入仿真，跳到备份站点的第一帧：它落在整轮的第 55 ms。上传站点从 0.088 ms 起就一直在发，通话站点第一次发送是在 23 ms，而这台备份站点整整等了五十几毫秒才第一次取得发送机会。' },
    { heading: '总得有人排在最后', text: '提前接入的额度只能从其他类别那里取得。后台这一类——备份、更新，以及任何没人在等的东西——拿到的是最长的静默和最宽的抽取范围，于是它最晚、也最少地取得发送机会。在一个繁忙的房间里，它的帧待在队列（queue）里的时间是通话的好几倍。这不是设计上的缺陷，这正是设计本身，也正是这一类存在的理由。' },
    { kind: 'watch', jump: 1, heading: '再去看一段更长的等待', text: '跳到上传站点的第一次扩展帧间间隔（extended interframe space, EIFS）：23.1912 ms 处它开始了一段 103 µs 的等待，比它那一类平时的 43 µs 长得多。往前一格看原因——它刚刚开始接收一帧，却因为一次碰撞没能把它解出来。通话站点和备份站点的泳道上，整轮都找不到这样一段。' },
  ],
  numbers: [
    { kind: 'table', heading: '三台站点实际的表现', head: [
      '站点', '类别', '静默',
      '抽取次数', '平均抽到', '平均排队时延',
    ], rows: [
      ['通话站点', 'VO', '34 µs', '33', '2.2', '1.49 ms'],
      ['上传站点', 'BE', '43 µs', '107', '7.9', '2.23 ms'],
      ['备份站点', 'BK', '79 µs', '14', '8.2', '10.23 ms'],
    ] },
    { heading: '这张表最后一列，就是那笔代价', text: '更短的那段静默（45 µs，五个时隙）加上更窄的抽取范围（平均抽到 2.2 个时隙，而不是 8.2 个），换来的就是最后那一列：通话的帧平均等 1.49 ms，备份的帧平均等 10.23 ms，约七倍。而备份站点在 300 ms 里只抽了 14 次倒数——它参与竞争的次数本身就更少。' },
    { kind: 'steps', heading: '没能解出一帧之后，这段等待是怎么算出来的', items: [
      '本机开始了一次接收，却没能把那一帧解出来——时间轴上那一格标着“接收失败”，原因可能是碰撞、信号相对噪声与干扰太弱、本机同时在发送，或者接收机改去同步了另一个明显更强的前导码（preamble）。最后这一种叫作捕获（capture effect）：接收机守住它先锁定的那个前导码，只有遇到明显更强的前导码时才改去同步。引擎就此记下“上一次是坏的”。',
      '下一次要开始竞争时，这条队列必等的静默不再是它自己的仲裁帧间间隔（arbitration interframe space, AIFS），而是 EIFS 减去分布式帧间间隔（DCF interframe space, DIFS）再加上这条队列的 AIFS。上传站点属于 BE 类，于是 94 − 34 + 43 = 103 µs。',
      'EIFS 本身 = 短帧间间隔（short interframe space, SIFS）+ DIFS + 用最低强制速率（mandatory rate）——这里是 6 Mb/s——发完一个确认帧（acknowledgement, ACK）的时间 = 16 + 34 + 44 = 94 µs。它覆盖的正是这样一段时间：如果那一帧本来是发给别人的，别人的确认帧就该出现在这段时间里。',
      '这段更长的等待一直有效，直到本机自己发送了一帧，或者又开始一次新的接收、由这次接收重新决定。它换掉的是那段必等的静默本身，而不是叠在它后面。',
    ] },
    { heading: '谁摊上过那段更长的等待', text: '300 ms 里只有上传站点碰上过解不出来的帧，一共七次，每次都要多等一段 103 µs；通话站点和备份站点各零次。这就是上一课那套规则里最后一个分支：同一个和式，同一条队列，只是那段必等的静默换了一个值。' },
  ],
  limits: [
    { kind: 'model-value', text: '那 103 µs 是引擎三个常数拼出来的，而其中最可疑的一个是「最低强制速率」：EIFS 里那个 44 µs 的确认帧一律按 6 Mb/s 算（phy.ts 的 ACK_TX_TIME_6M_NS），连 2.4 GHz 的那套帧间间隔也用同一个数。真实的 2.4 GHz 网络最低强制速率可能是 1 Mb/s，同一条规则会算出一段长得多的等待。' },
    { kind: 'threshold', text: '触发这段等待的「没能把一帧解出来」在引擎里是一个二值判决：比值够就一定解得出，不够就一定失败。真实接收机在门限附近是一条概率曲线，所以那七次 EIFS 在真实设备上会是一个随机的次数，而不是一个能被钉住的数。整轮里只有上传站点摊上过，靠的也是这份确定性。' },
    { kind: 'out-of-scope', until: 'wan-rtt', text: '「谁付了多少」那张表只算到排队时延与抽签次数，因为本课这个场景之上什么都没有：它的 servers 是空的，于是语音来回两个方向都按每 20 ms 一帧 200 字节的本机时钟走。场景里放一台通话服务器，回程就不再按本机时钟走，而是对每一个已被确认的语音帧的回声（traffic.ts 的 scheduleVoice），往返才有一个分母——「云端往返」那一课就是这么量的。仍然没有的是抖动缓冲与丢帧之后的编解码补偿，所以 1.49 ms 与 10.23 ms 只是 MAC 层的排队时间，不是通话质量。' },
    { kind: 'unmodelled', text: '这个代价是在一个只有三台设备、没有外来干扰、电平不随时间变化的房间里算出来的。真实家里同一段时间还有邻居的网络在抢同一片空口，最低那一类付出的代价常常远多于七倍，甚至长时间一帧也发不出去。要问「后台流量会不会被饿死」，这个场景答不了。' },
  ],
  sources: [
    '收到坏帧之后的等待写作 EIFS − DIFS + AIFS[AC]，见 IEEE Std 802.11-2024 的 §10.23.2.2；EIFS = aSIFSTime + DIFS + 以最低强制速率发完一个 ACK 的时间，见 §10.3.2.3.7。',
    '四个接入类别的默认参数见 Table 9-194。',
    '三台站点、它们的业务模型、随机种子，以及“哪一次接收解不出来”所依赖的捕获余量，都是本仿真器的模型取值，而非标准中的数值。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Caller (VO)', 'sta', 3.5, 5, 'he', 'voice'),
    node('sta-2', 'Uploader (BE)', 'sta', 6.5, 5, 'he', 'saturated'),
    node('sta-3', 'Backup (BK)', 'sta', 5, 6.5, 'he', 'backup'),
  ]),
  jumps: [
    J('后台站点的第一帧', (r) => r.type === 'TX_START' && r.node === 'sta-3' && r.frame.kind === 'data'),
    J('上传站点的第一次 EIFS', (r) => r.type === 'IFS_START' && r.node === 'sta-2' && r.kind === 'EIFS'),
  ],
  observe: [
    '备份站点的每个倒数色块都标着 AC_BK，块上那段静默是 79 µs。300 ms 里它只抽了 14 次倒数，通话站点抽了 33 次，上传站点抽了 107 次。',
    '把三台站点的排队时延并排读：1.49 ms、2.23 ms、10.23 ms。它们跑的是同一套规则，只有那两个数不同。',
  ],
  tryThis: [
    '在功能面板里关掉通话站点的增强型分布式信道接入（enhanced distributed channel access, EDCA）再载入。它退回成单队列，用回那段旧的固定等待和旧的宽窗口，它的帧要多等大约两倍半的时间——这就是优先接入在这个房间里值多少。',
  ],
  quiz: [
    {
      q: '一帧语音入队时，邻居正发到一串长突发的一半。它会怎么样？',
      options: [
        '它打断那串突发，因为语音有优先级',
        '它等那串突发结束，然后带着更短的静默去争下一轮',
        '它被丢掉，因为信道忙',
      ],
      answer: 1,
      explain: '优先级完全是在帧与帧之间的静默里决出来的。这套机制里没有任何东西能动一下已经开始的传输。',
    },
    {
      q: '为了别人更短的那段静默，后台这一类付出了什么？',
      options: [
        '更低的数据速率',
        '最长的静默和最宽的抽取范围，于是它的帧在队列里待得久得多',
        '什么都没付：四个类别互不干扰',
      ],
      answer: 1,
      explain: '信道只有一条。给了某一类的东西，必然是从另一类身上拿的——而一次备份，本来就该让出这些。',
    },
    {
      q: '一台站点开始接收一帧，却没能把它解出来。它下一次竞争前要等多久？',
      options: [
        '和平常一样，它那一类的 AIFS',
        '一段更长的 EIFS 换掉那段静默：这里是 103 µs，而不是 43 µs',
        '什么都不等，因为它根本没收到东西',
      ],
      answer: 1,
      explain: '解不出来的那一帧可能是发给别人的，它的确认帧本该紧跟着出现。多等的这一段就是留给那个确认帧的，免得本机的发送与它相撞。',
    },
  ],
}
