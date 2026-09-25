/**
 * Wi-Fi Tier 1 · M5 · 听不见的邻居与损失 · Rate anomaly — fairness gone wrong.
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
  why: '信道接入的规则在一件事上一丝不苟地公平：下一轮该轮到谁。手里总有东西要发的站点（STA），抢到空口的次数和邻居差不多。规则从不过问的是：一轮能持续多久。离接入点（AP）远的站点只能慢慢发，同样一个帧要把空口占住好几倍的时间——而空口是一只共用的钟。最后，快的那台也快不到哪里去。',
  outcomes: [
    '说清信道接入规则给的是哪一种公平、不给的是哪一种',
    '把一台站点的轮次和它的空口占比放在一起比',
    '预测一台慢站点进屋之后，快站点的吞吐量会怎样',
  ],
  needs: ['airtime', 'collisions-cw'],
  terms: [
    { term: 'airtime share', plain: '整段时间里被某一台站点自己的发送占掉的那一部分' },
    { term: 'performance anomaly', plain: '一台站点只能慢慢发，于是所有人的吞吐量都掉下来' },
    { term: 'rate control', plain: '帧接连失败之后，发送方退到更慢、更结实的编码上去' },
  ],
  picture: [
    { heading: '公平的是轮次', text: '两台站点，队列（queue）都永远排不空，轮流上空口。每一台都先熬过规定的空闲时间，再数完自己抽到的那个随机的时隙（slot time）数，数到零就发。这套流程没有任何一步去问帧有多大。跑得久了，两台抢到空口的次数差不多相等——规则承诺的就是这个。' },
    { heading: '可一轮的长短并不固定', text: '两台之中有一台在公寓的另一头，隔着一堵墙。它的信号到达接入点时已经很弱，用不了近端那种又快又娇气的编码，只能退到更慢、更结实的一档，每个符号（symbol）装的比特更少。字节一样，空口时间（airtime）却是好几倍。帧一开始失败，它又自己往下退一档——这就是速率控制。' },
    { kind: 'watch', jump: 0, heading: '把两种轮次摆在一起看', text: '载入仿真，跳到第一个数据帧（data frame）。两条泳道在同一瞬间起跑。现在看两个绿色块各自伸到哪里：它们装的字节数是一样的。' },
    { heading: '所有人都被拉向慢的那一个', text: '不数轮次而数空口时间，画面就翻了过来：慢站点占住大头，快站点只剩一个小角，而它自己的链路（link）毫发无损。这就是性能异常——不是哪家无线电的毛病，而是“分轮次而不分时间”的必然结果。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '同一段 3.6 ms 里，两台各三轮',
      spec: anomalyTiming(),
      caption: '轮数一样，块长不一样：近端每轮 248 µs，远端每轮 704 µs，两边装的都是 1528 字节。近端只能挤进远端块之间的空当——一秒钟挤得进几次，由远端剩下多少空当决定。',
    },
    { heading: '一轮的长短是怎么来的', kind: 'table', head: [
      '帧', '速率', '字节', '空口时间',
    ], rows: [
      ['近端站点，每一帧', '54 Mb/s', '1528', '248 µs'],
      ['远端站点，最好的一档', '18 Mb/s', '1528', '704 µs'],
      ['远端站点，连降两档之后', '9 Mb/s', '1528', '1384 µs'],
    ] },
    { heading: '这间屋子让快站点付出了什么', text: '把远端删掉，同样的 200 ms 里近端送出的就不是 209 帧，而是 510 帧：远端拿走的不是它的轮次，而是那些轮次能落脚的空口时间。远端若独占房间，自己能送出 234 帧——比两台共处一室时任何一台都多。' },
    { kind: 'steps', heading: '从“轮次相等”到“吞吐不等”，一步一步', items: [
      '两台站点手里永远有帧。每一台先等空口连续安静一个分布式帧间间隔（DCF interframe space, DIFS）：16 µs 的间隔加两个 9 µs 的时隙，合 34 µs。刚刚有一帧没能解出来的站点，等的是更长的扩展帧间间隔（extended interframe space, EIFS）。',
      '接着各自在 0 到自己的竞争窗口（contention window, CW）之间抽一个整数时隙数——窗口从 15 起步——每过一个空闲时隙减一。两台抽的是同一个窗口，所以跑得久了归零的次数差不多。',
      '谁先归零谁就发一帧。两边都是 1528 字节，用的是各自链路撑得住的那个速率——到这一步为止，流程从没问过这个速率是多少。',
      '这一轮有多长，就是那 1528 字节按它自己的速率发完要多久：近端 248 µs，远端平均 795 µs。这段时间里屋里其余的计数器全都冻着。',
      '接入点回一个 14 字节的确认帧（ACK），流程重新来过。轮次是均匀发下去的，每一轮花掉的那些秒却不是。',
      '于是它的吞吐量就是每秒被确认的轮次乘 1528 字节再乘 8 比特；而每秒能有几轮，取决于另一台的长轮次剩下多少空当——相等的轮次就是这样变成不等的吞吐量的。',
    ] },
    { kind: 'table', heading: '同样的 200 ms，照着步骤算一遍', head: [
      '步骤', '近端·快', '远端·慢',
    ], rows: [
      ['200 ms 内抢到的轮次', '209', '154'],
      ['每轮的空口时间', '248 µs', '795 µs'],
      ['= 占住的空口时间', '51.8 ms · 25.9 %', '122.4 ms · 61.2 %'],
      ['这些轮次里被确认的', '209', '135'],
      ['= 每秒送达的帧数', '1045', '675'],
      ['× 1528 字节 × 8 比特', '12.8 Mb/s', '8.3 Mb/s'],
    ] },
    { heading: '第四行为什么不等于第一行', text: '远端抢到 154 轮，被确认的只有 135 轮，其余整帧报废——所以进入最后两行的是被确认的那些轮次。原因在这里看不出来：时间轴上一次碰撞都没记，因为两帧同时开始时接入点只锁住了更强的那个前导码（preamble）。第一阶段的项目复盘会拆开讲它——那个场景里各站点的到达电平相差 34.4 dB，捕获效应才真的会发生。' },
  ],
  sources: [
    '802.11 的性能异常出自 Heusse、Rousseau、Berger-Sabbatel 与 Duda 的《Performance anomaly of 802.11b》（IEEE INFOCOM 2003）；它作为前提的“每站公平”，即 IEEE Std 802.11-2024 §10.3.4 的 DCF 接入流程。',
    'EIFS 的长度与“接收失败之后才欠这一段”见 §10.3.2.3.6；DIFS 见 §10.3.2.3.5。',
    '这里的速率、1528 字节的帧长与各自的空口时间，出自本仿真器自己的 OFDM 模型；−82 dBm 的检测底、4 dB 的前导检测余量和墙体损耗都是模型取值，上面每一个计数都可由场景的随机种子复现。',
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
    '远端的绿色块比近端长得多，而且有三种长度——704、1044、1384 µs——那是速率控制一档档调下去的结果。字节数每次都一样。',
    '检视器：前 200 ms 里两者的轮次相当，可远端占用的空口时间是近端的两倍多。',
    '两台加在一起把空口占住了九成以上的时间，送达的量却还不如近端自己一台的时候。',
  ],
  tryThis: [
    '在编辑器里删掉远端站点后重新载入：近端 200 ms 内送达的帧数从 209 跳到 510。',
    '把远端一米一米地往接入点挪：它的绿色块随速率爬升一级级变短，近端的帧数跟着涨。',
  ],
  quiz: [
    {
      q: '信道接入规则给每台“总有东西要发”的站点大致相等的是……',
      options: [
        '空口时间',
        '吞吐量',
        '轮次数量',
      ],
      answer: 2,
      explain: '每台站点都从同一个窗口里抽数，抢到轮次的频率彼此相当；一轮花掉多少时间则取决于各自的速率。',
    },
    {
      q: '远端站点一进屋，近端的吞吐量为什么会掉？',
      options: [
        '它自己的信号变弱了',
        '分给它的轮次比远端少',
        '远端的每一轮都把空口占住很久，于是一秒钟里装得下的轮次总数变少了',
      ],
      answer: 2,
      explain: '它的链路毫发无损，轮次的份额甚至还更多一些。它丢掉的，是那些长轮次花掉的秒。',
    },
  ],
}
