/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · the random draw and the frozen countdown.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M4). The
 * lesson used to carry six things: the draw, counting idle slots, freezing, the
 * collision, the ACK-timeout deadline and the doubling window. The last three
 * are a second rule the engine follows — what happens when the answer never
 * comes — and they are now `collisions-cw`, on this same scene
 * (`sameSceneAs: 'backoff'`), with jumps 0, 1 and 3 of the old list, the
 * deadline table, the doubling table and the 864/47 figures. `deeper` went with
 * them: both of its notes are about the collision.
 *
 * What is left here is one topic: draw a number, count it down only through
 * idle slots, and freeze the instant somebody else starts. This half keeps the
 * freeze jump and the slot-counting experiment.
 *
 * Also cut, under §5.2: the dice, which were the lesson's structure rather than
 * seasoning (「先掷骰子，再倒着数」,「当两颗骰子点数相同」,「再拿同一颗骰子重来
 * 是愚蠢的」) and 「沉默就是判决」. The mechanism is a random draw; a die is one
 * way to picture it, not what the station has. And 「一格也没丢」, the paragraph
 * that repeated the 770 pairs the first `observe` line already gives (§5.3).
 *
 * Every number quoted below is pinned in tests/course/backoff.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash stays identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstFreeze, J } from '../lessonKit'

/**
 * The run's own first freeze, to scale. Every instant here is a record of this
 * lesson's base run: BACKOFF_DEC at 480/489/498, BACKOFF_FREEZE at 498 with
 * value 3, the neighbour's TX_START/TX_END at 498/746, the access point's
 * acknowledgement at 762/790, IFS_START 790 → 824, BACKOFF_RESUME at 824 with
 * the same 3, and the three decrements that follow before the frame at 851.
 *
 * It replaces the paragraph that used to walk those instants in prose: the
 * point of the rule is that the counting segments are short and the frozen
 * segment is long, and a length is what a picture says and a sentence does not.
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
        { fromUs: 498, toUs: 790, label: '冻住在 3', tone: 'muted' },
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
  title: '抽一个数，只在空闲时隙里倒数',
  why: '光是等，解决不了争端。两台站点（station, STA）都攒着东西要发、都在等信道安静下来，它们就会在同一瞬间听到它安静下来，然后一起开口——一条不带随机性的规则，会让两台一模一样的设备永远做出一模一样的事。所以每台站点在获准开口之前，先给自己抽一个随机的等待，再只在信道真的空着的时候，一个时隙（slot time）一个时隙地把它数完。',
  outcomes: [
    '用自己的话说清“抽一个数、再只在空闲时隙里倒数”这条规则',
    '解释这个计数器为什么不照挂钟走，而是照空闲时隙走',
    '说出一个被打断的计数恢复时从几开始，并在时间轴上核对',
  ],
  needs: ['ifs'],
  terms: [
    { term: 'backoff', plain: '获准开口之前要倒着数完的那个随机的空闲时隙数' },
    { term: 'CW', plain: '竞争窗口：抽那个随机数时，取值范围的上限' },
  ],
  picture: [
    { heading: '两台站点，同一瞬间', text: '这里的两台站点都很忙，都在等信道，遵守的也是同一条规则。要求的那段安静一走完，它们的状态一模一样——也就是说，一条不带随机性的规则会让它们在同一微秒开口，每一次都这样。讲礼貌是不够的：必须有点什么，让两台一模一样的站点做出不一样的事。' },
    { heading: '抽一个数，再倒着数', text: '于是每台站点抽一个随机整数，把它当作“要熬过的空闲时隙数”：这就是它的退避（backoff）值。抽的范围是 0 到竞争窗口（contention window, CW），两端都算。信道每安静一个时隙，这个数就减一；减到零就发。抽得小的赢，而由于两边各抽各的，赢家每一轮都可能换人。' },
    { kind: 'watch', jump: 0, heading: '去看一次冻结', text: '载入仿真，跳到第一次退避冻结。邻居的数据帧（data frame）在 498 µs 开口，STA-1 的计数器正好数到 3，就停在那里不动。它要等邻居这一帧、接入点（access point, AP）回的确认帧（acknowledgement, ACK），再加一个分布式帧间间隔（DCF interframe space, DIFS）都过去，824 µs 才继续。' },
    { heading: '冻住，而不是重来', text: '计数的中途有帧开始，计数就地冻结；等空口重新安静、该等的间隙也走完了，它从停下的那个数继续，一格也不补、一格也不退。这不是细节，而是这套规则里唯一的公平来源：已经等过的时间从不作废。如果换成“被打断就重抽”，一台不巧总被打断的站点会被永远压在底下。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '本轮仿真的第一次冻结，按比例画',
      spec: backoffTiming(),
      caption: '计数的两段很短，冻住的那段很长。STA-1 在 480 µs 数到 5、489 µs 数到 4、498 µs 数到 3，邻居恰在 498 µs 开口，于是它停在 3；邻居的帧到 746 µs 结束，确认帧到 790 µs 结束，一个 DIFS 走到 824 µs，它才从同一个 3 继续，并在 851 µs 发出自己的帧。',
    },
    { heading: '本轮抽出来的数', text: '300 ms 里，这两台站点从下限窗口 CW = 15 抽了 770 次，平均抽到 7.15 个时隙。每个时隙是 9 µs，于是平均等待约 64 µs——比一个 DIFS 还长一点，而且每一轮都不一样长。' },
    { kind: 'steps', heading: '抽数与倒数，精确版', items: [
      '竞争窗口从下限 15 起步，链路（link）上每一台站点都从这里开始。',
      '当它欠的那段间隙走完、而且这一次确实欠一个抽取时，站点在 0 与 CW 之间均匀地抽一个整数，两端都算在内——CW 为 15 时共十六个可能值，零也是其中之一。',
      '介质（medium）每空闲满一个 9 µs 的时隙，这个计数就减一。把它带到零的那个时隙，就是站点发送的那个时隙。',
      '一旦介质变忙——可能是侦听到能量，也可能是它旁听到的某一帧给它装上了预约倒计时——下一次减一就被取消，计数原地冻住。',
      '等介质重新安静下来，它先走完该等的间隙，再从同一个数继续；已经等过的部分一点也不作废。',
      '只要发送过一次，计数就会清空、并欠下一次新的抽取——所以没有哪台站点能不重新竞争就连发两帧。',
    ] },
  ],
  sources: [
    '退避过程见 IEEE Std 802.11-2024 的 §10.3.4.3；aCWmin 15 与 aSlotTime 9 µs 见 §17.4.4。',
    '“介质忙就冻住、重新安静之后接着数”同样见 §10.3.4.3：退避计数只在介质被判为空闲满一个时隙时递减。',
    '本轮抽到的那些数、770 这个组数，以及图里的每一个时刻，都是本仿真器的场景，靠随机种子可以复现；两台饱和站点与 1528 字节的帧同样如此。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一次退避冻结', firstFreeze),
  ],
  observe: [
    '计数器（bo:n）只在信道空闲时递减，对方一发送就冻结，之后从同一个值继续——本轮共 770 组冻结与恢复，没有一组丢掉过一个时隙。',
    '在第一次冻结处暂停，往后走到恢复：中间隔着邻居的整帧、它的确认帧，还有一个 DIFS，而计数器一格也没动。',
  ],
  tryThis: [
    '数一数从一个 DIFS 结束到紧随其后那一帧开始之间的空闲时隙。它永远等于那台站点抽到的数。',
  ],
  quiz: [
    {
      q: '别的站点在发送时，一个计数器冻结在 7。恢复时它从几开始？',
      options: [
        '重新抽一个数',
        '7——正是它停下的那个数',
        '0，因为等待已经结束了',
      ],
      answer: 1,
      explain: '已经等过的时间从不作废。正是这一点，让等了很久的站点不至于被刚到的站点后来居上。',
    },
    {
      q: '计数器为什么数空闲时隙，而不是直接数微秒？',
      options: [
        '因为微秒太短，硬件数不过来',
        '因为要等的是“信道空着”的时间：空口一忙计数就该停，而时隙正是判一次空闲所需的长度',
        '因为标准里没有微秒这个单位',
      ],
      answer: 1,
      explain: '这个数说的是“我还要看到多少个空闲时隙才开口”。忙的那段不算数，所以它不可能是一段挂钟时间。',
    },
  ],
}
