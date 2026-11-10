/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · Rate anomaly — fairness gone wrong.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M5). This
 * lesson **stays whole**: equal turns and unequal airtime are one claim read two
 * ways, and every observe line and quiz already serves it. What went:
 *
 *  - §5.3, the same figures printed three times. 209/154 turns, 248/795 µs and
 *    the airtime shares appeared in the intro prose, in a summary table and in
 *    the step-by-step table. The summary table is gone; the worked table (which
 *    carries every one of its columns and four more) and the new timing figure
 *    stay, and the prose no longer restates either.
 *  - §5.2, two metaphors doing no work: 「被分掉的其实是时钟」, the shared clock in
 *    its fourth outing, and the whole 「没有谁在耍赖」 section, which is moralising
 *    with no mechanism in it.
 *  - §7, the capture-effect depth — the decibel table, why the stronger preamble
 *    wins, and the fifteen silent losses. It is a DIFFERENT mechanism with
 *    nothing to watch here (no jump anchors it, and the timeline records no
 *    collision at all), so it moves to `rate-vs-model`, which already explains
 *    capture and has the scene for it. What stays is the one sentence that makes
 *    the fourth row of the worked table honest, pointing forward.
 *
 * The timing figure replaces the deleted summary table's job: three turns each,
 * the far station's blocks nearly three times as long, drawn to scale from the
 * run's own TX_STARTs.
 *
 * Two engine truths established here survive unchanged and stay pinned: a
 * station that has just failed to decode a reception waits an EIFS rather than a
 * DIFS (`MacSim.armIfs` in src/engine/mac.ts; 166 of this scene's 833 station
 * waits, every one of them at the far station), and the far station's turns are
 * not all acknowledged.
 *
 * Every number quoted below is pinned in tests/course/anomaly.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, longApartment, node, sc, firstData, J } from '../lessonKit'

/**
 * A 3.6 ms window of the run in which each station takes exactly three turns,
 * to scale. Every span is one TX_START and its own `txTimeNs` — the near
 * station's 248 µs three times, the far station's 704 µs three times — and
 * `anomaly.test.ts` reads each one back out of this spec.
 *
 * Three against three is the whole argument: the turns are equal and the blocks
 * are not, so what the far station takes is not turns but the clock they run on.
 */
export function anomalyTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '近端·快', spans: [
        { fromUs: 4322, toUs: 4570, label: '248 µs' },
        { fromUs: 5542, toUs: 5790 },
        { fromUs: 6735, toUs: 6983 },
      ] },
      { label: '远端·慢', spans: [
        { fromUs: 3491, toUs: 4195, label: '704 µs', tone: 'accent' },
        { fromUs: 4738, toUs: 5442, tone: 'accent' },
        { fromUs: 5913, toUs: 6617, tone: 'accent' },
      ] },
    ],
    axis: { fromUs: 3400, toUs: 7000, ticks: [3400, 4400, 5400, 6400], unit: 'µs' },
  }
}

export const anomaly: Lesson = {
  id: 'anomaly',
  module: 4,
  title: '速率异常——“公平”的反面',
  why: '信道接入规则在一件事上是严格公平的：下一轮由谁发送。站点（STA）都从同一个窗口中随机选取退避（backoff）值，流程中没有任何一步考虑帧有多长、速率多高，所以始终有帧待发的站点，竞争成功的轮次大致相当。规则从不考虑的是：一轮会持续多久。离接入点（AP）较远、隔着一堵墙的那台站点信号较弱，只能使用更慢、更稳健的编码，同样字节数的一帧要占用近三倍的空口时间（airtime）；帧一旦失败，它还会进一步降低速率，每轮的时长随之增加。它占用信道的一轮期间，房间里其余站点的计数器全部冻结。所以不按轮次而按时间统计，结论就相反：慢站点的空口占比是快站点的两倍多；快站点自己的链路（link）完全正常，轮次甚至还多一些，吞吐量却降到它独占房间时的一半以下。两台合计占用了九成以上的空口时间，送达的帧数却少于快站点单独存在时。这就是性能异常（performance anomaly）：它不是某一台无线电的缺陷，而是“按轮次分配、不按时间分配”的必然结果。',
  outcomes: [
    '说明信道接入规则提供的是哪一种公平、不提供哪一种',
    '把一台站点的轮次与它的空口占比放在一起比较',
    '预测一台慢站点加入之后，快站点的吞吐量会如何变化',
  ],
  needs: ['airtime', 'collisions-cw'],
  terms: [
    { term: 'airtime share', plain: '空口占比：整段时间中被某一台站点自身的发送所占用的比例' },
    { term: 'performance anomaly', plain: '一台站点只能以低速率发送，导致所有站点的吞吐量都下降' },
    { term: 'rate control', plain: '帧连续失败之后，发送方改用更慢、更稳健的编码' },
  ],
  picture: [
    { heading: '公平的是轮次', text: '两台站点的队列（queue）始终不空，轮流占用空口。每一台都先等待规定的空闲时间，再递减完自己随机选取的时隙（slot time）数，减到零就发送。这套流程没有任何一步考虑帧有多长。运行时间足够长时，两台都能获得大致相当的轮次，任何一台都不会被排除在外——规则保证的就是这一点；它并不保证次数完全相同，这个房间里快站点甚至还多竞争成功一些。' },
    { heading: '但一轮的时长并不固定', text: '两台中有一台在公寓的另一端，隔着一堵墙。它的信号到达接入点时已经很弱，达不到近端所用最快编码要求的电平，只能降到更慢、更稳健的一档，每个符号（symbol）承载的比特更少。字节数相同，空口时间（airtime）却是数倍。帧一旦开始失败，它又自行再降一档——这就是速率控制。' },
    { kind: 'watch', jump: 0, heading: '对比两种轮次', text: '载入仿真，跳到第一个数据帧（data frame）。两条泳道在同一时刻开始发送。现在观察两个绿色块各自延伸到哪里：它们承载的字节数相同。' },
    { heading: '所有站点的性能都受慢站点限制', text: '不按轮次而按空口时间统计，结论就相反：慢站点占用了大部分空口时间，快站点只剩很小的一部分，而它自己的链路（link）完全正常。这就是性能异常——它不是某一台无线电的缺陷，而是“按轮次分配、不按时间分配”的必然结果。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '同一段 3.6 ms 内两台站点各三轮',
      spec: anomalyTiming(),
      caption: '轮数相同，块长不同：近端每轮 248 µs，远端每轮 704 µs，双方承载的都是 1528 字节。近端只能利用远端两个块之间的空闲间隔——每秒能利用多少次，取决于远端留下多少空闲间隔。',
    },
    { heading: '一轮时长的由来', kind: 'table', head: [
      '帧', '速率', '字节', '空口时间',
    ], rows: [
      ['近端站点，每一帧', '54 Mb/s', '1528', '248 µs'],
      ['远端站点，最高的一档', '18 Mb/s', '1528', '704 µs'],
      ['远端站点，连降两档之后', '9 Mb/s', '1528', '1384 µs'],
    ] },
    { heading: '快站点在这个房间中损失了什么', text: '删除远端站点后，同样的 200 ms 内近端送达的不是 209 帧，而是 510 帧：远端占去的不是它的轮次，而是那些轮次所需的空口时间。远端若独占房间，自己能送达 234 帧——比两台共处一室时任何一台都多。' },
    { kind: 'steps', heading: '从“轮次相等”到“吞吐量不等”的推导', items: [
      '两台站点始终有帧待发。每一台先等待空口连续空闲一个分布式帧间间隔（DCF interframe space, DIFS）：16 µs 的间隔加两个 9 µs 的时隙，合计 34 µs。刚刚有一帧未能解出的站点，等待的是更长的扩展帧间间隔（extended interframe space, EIFS）。',
      '接着各自在 0 到自己的竞争窗口（contention window, CW）之间随机选取一个整数时隙数——窗口初始值为 15——每经过一个空闲时隙减一。两台使用的是同一个窗口，所以运行时间足够长时归零的次数大致相同。',
      '先归零的站点发送一帧。双方都是 1528 字节，使用的是各自链路可支持的速率——到这一步为止，流程从未考虑这个速率是多少。',
      '这一轮的时长，就是这 1528 字节按它自己的速率发送完毕所需的时间：近端 248 µs，远端平均 795 µs。这段时间内房间里其余站点的计数器全部冻结。',
      '接入点回复一个 14 字节的确认帧（ACK），流程重新开始。轮次是均匀分配的，每一轮所占用的时间却不均匀。',
      '因此它的吞吐量等于每秒被确认的轮次乘以 1528 字节再乘以 8 比特；而每秒能有多少轮，取决于另一台的长轮次留下多少空闲时间——相等的轮次就这样变成了不等的吞吐量。',
    ] },
    { kind: 'table', heading: '同样的 200 ms：按上述步骤计算', head: [
      '步骤', '近端·快', '远端·慢',
    ], rows: [
      ['200 ms 内竞争成功的轮次', '209', '154'],
      ['每轮的空口时间', '248 µs', '795 µs'],
      ['= 占用的空口时间', '51.8 ms · 25.9 %', '122.4 ms · 61.2 %'],
      ['这些轮次中被确认的', '209', '135'],
      ['= 每秒送达的帧数', '1045', '675'],
      ['× 1528 字节 × 8 比特', '12.8 Mb/s', '8.3 Mb/s'],
    ] },
    { heading: '第四行为什么不等于第一行', text: '远端竞争成功 154 轮，被确认的只有 135 轮，其余整帧失败——所以计入最后两行的是被确认的那些轮次。失败的原因在这里看不出来：时间轴上没有记录任何一次碰撞，因为两帧同时开始时接入点只锁定了更强的那个前导码（preamble）。第一阶段的项目复盘会详细分析——那个场景里各站点的到达电平相差 34.4 dB，捕获效应（capture effect）才会真正发生：接收机一旦锁定某个前导码就保持锁定，只有遇到明显更强的前导码时才转而与之同步。' },
  ],
  limits: [
    { kind: 'model-value', text: '这里的速率控制只有两个计数：连续两次失败降一档，连续十次成功升一档，而按信号强度查表得到的那一级是它永远不会超过的上限（src/engine/rate.ts）。整个控制器中没有随机性、没有探测帧，也没有丢包率统计窗口。真实的速率控制还会参考近期的成功率与信道忙闲，并主动发送探测帧测试更高的一级——所以远端在这里降档与升档的节奏完全由这两个常数决定。', seeAlso: 'rate-vs-model' },
    { kind: 'unmodelled', text: '它无法区分碰撞与衰落：一次碰撞和一次信号过弱在 onFailure 中被视为同一类事件，于是远端会因碰撞而降速，降速又使它占用空口更久。把碰撞误判为衰落是真实设备的普遍行为，引擎没有建模的是缓解这种误判的方法——降档前先用一个短帧试探，或者改用短窗口内的丢包率而不是连续失败计数。', seeAlso: 'rate-vs-model' },
    { kind: 'threshold', text: '远端 154 轮中有 19 轮整帧失败，而这里的成败是一条硬门限：用整帧中最差的那个比值与该级的要求比较，满足就整帧接收成功，差 0.1 dB 就整帧失败（channel.ts 的 resolveLock）。真实链路在门限附近是一条误包率曲线，慢站点的失败率随距离平滑上升，不会像这里一样成段地出现或消失。' },
    { kind: 'out-of-scope', text: '209 对 154 轮、12.8 与 8.3 Mb/s，只在以下几条同时成立时才成立：两台站点始终有帧待发（饱和业务模型），位置固定、链路电平是由几何位置决定的定值（默认无衰落），房间里没有第三台设备，也没有邻居网络。真实住宅中这几条都不成立，性能异常的表现因此没有这么规整——但趋势是一致的。' },
    { kind: 'out-of-scope', text: '本场景的站点不为帧标注业务类别，没有传输机会（transmit opportunity, TXOP），也不聚合，所以每一轮的时长只由速率决定，「一轮」就是一帧。现在的设备竞争成功一次可以连续发送多帧，而聚合恰恰会放大这种异常——慢站点一次占用的时间更长，快站点能利用的空闲间隔更少。', until: 'txop' },
  ],
  sources: [
    '802.11 的性能异常出自 Heusse、Rousseau、Berger-Sabbatel 与 Duda 的《Performance anomaly of 802.11b》（IEEE INFOCOM 2003）；它作为前提的“每站公平”，即 IEEE Std 802.11-2024 §10.3.4 的 DCF 接入流程。',
    'EIFS 的长度与“只有接收失败之后才需要等待这一段”见 §10.3.2.3.6；DIFS 见 §10.3.2.3.5。',
    '这里的速率、1528 字节的帧长与各自的空口时间，出自本仿真器自己的 OFDM 模型；−82 dBm 的检测下限、4 dB 的前导检测余量和墙体损耗都是模型取值，上面每一个计数都可由场景的随机种子复现。',
  ],
  scenario: () => sc(longApartment(), [
    node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle'),
    node('sta-1', 'Near & fast', 'sta', 4.8, 4.3, 'nonht', 'saturated'),
    node('sta-2', 'Far & slow', 'sta', 15, 7, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一个数据帧', firstData),
  ],
  observe: [
    '远端的绿色块比近端长得多，而且有三种长度——704、1044、1384 µs——那是速率控制逐档下调的结果。字节数每次都相同。',
    '检视器：前 200 ms 内两者的轮次相当（近端还多一些），但远端占用的空口时间是近端的两倍多。',
    '两台合计占用了九成以上的空口时间，送达的帧数却少于近端单独存在时。',
  ],
  tryThis: [
    '在编辑器里删除远端站点后重新载入：近端 200 ms 内送达的帧数从 209 增加到 510。',
    '把远端站点每次一米地向接入点移动：它的绿色块随速率逐级升高而逐级变短，近端的帧数随之增加。',
  ],
  quiz: [
    {
      q: '信道接入规则给每台“总有帧要发”的站点大致相等的是……',
      options: [
        '空口时间',
        '吞吐量',
        '轮次数量',
      ],
      answer: 2,
      explain: '每台站点都从同一个窗口中随机选取，竞争成功的频率大致相当；一轮占用多少时间则取决于各自的速率。',
    },
    {
      q: '远端站点加入后，近端的吞吐量为什么会下降？',
      options: [
        '它自己的信号变弱了',
        '分配给它的轮次比远端少',
        '远端的每一轮都占用空口很长时间，于是每秒能容纳的轮次总数减少了',
      ],
      answer: 2,
      explain: '它的链路完全正常，轮次份额甚至还多一些。它损失的是那些长轮次所占用的时间。',
    },
  ],
}
