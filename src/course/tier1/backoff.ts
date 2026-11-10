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
        { fromUs: 498, toUs: 790, label: '冻结在 3', tone: 'muted' },
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
  title: '随机选取一个数，只在空闲时隙内递减',
  why: '仅靠等待无法解决竞争。两台站点（station, STA）都有帧待发、都在等待信道空闲，它们就会在同一时刻检测到信道空闲，然后同时开始发送——一条不带随机性的规则，会让两台完全相同的设备永远作出完全相同的行为。所以每台站点在获准发送之前，先在零到竞争窗口（contention window, CW）之间均匀地随机选取一个整数，这就是它的退避（backoff）值；信道每空闲满一个时隙（slot time），这个数减一，减到零就发送。两台站点各自独立选取，取值小的先发送，每一轮竞争成功的可能是不同的站点。计数按空闲时隙递减，而不是按实际经过的时间：其他站点一开始发送，计数立即冻结，等那一帧、它的确认帧（acknowledgement, ACK），再加一个分布式帧间间隔（DCF interframe space, DIFS）都结束，才从冻结时的值继续递减，既不多减、也不少减。已经等待的时间不会作废，这是这套规则中公平性的唯一来源——如果改为被打断就重新选取，总是恰好被打断的站点会始终排在后面。竞争窗口处于初始值时，平均退避时间接近两个 DIFS，而且每轮长短不同；发送完一帧计数就清空，下一帧必须重新选取，任何站点都不能不经重新竞争而连续发送两帧。',
  outcomes: [
    '用自己的话说明“随机选取一个数、只在空闲时隙内递减”这条规则',
    '解释这个计数器为什么不按实际经过的时间递减，而是按空闲时隙递减',
    '说出一个被打断的计数恢复时从哪个值开始，并在时间轴上核对',
  ],
  needs: ['ifs'],
  terms: [
    { term: 'backoff', plain: '获准发送之前必须递减到零的随机空闲时隙数' },
    { term: 'CW', plain: '竞争窗口：随机选取退避值时取值范围的上限' },
  ],
  picture: [
    { heading: '两台站点，同一时刻', text: '这里的两台站点都有大量帧待发，都在等待信道，遵守的也是同一条规则。规定的空闲时间一结束，它们的状态完全相同——也就是说，一条不带随机性的规则会让它们在同一微秒开始发送，而且每次都如此。仅靠“先侦听再发送”是不够的：必须引入某种机制，使两台完全相同的站点作出不同的行为。' },
    { heading: '随机选取一个数，再递减计数', text: '因此每台站点随机选取一个整数，作为“还需经过的空闲时隙数”：这就是它的退避（backoff）值。取值范围是 0 到竞争窗口（contention window, CW），包含两端。信道每空闲一个时隙，这个数就减一；减到零就发送。取值小的那台先发送，而由于双方各自独立选取，每一轮竞争成功的可能是不同的站点。' },
    { kind: 'watch', jump: 0, heading: '观察一次冻结', text: '载入仿真，跳到第一次退避冻结。邻居的数据帧（data frame）在 498 µs 开始发送，STA-1 的计数器恰好减到 3，随即冻结在这个值。它要等邻居这一帧、接入点（access point, AP）回复的确认帧（acknowledgement, ACK），再加一个分布式帧间间隔（DCF interframe space, DIFS）都结束，到 824 µs 才继续递减。' },
    { heading: '冻结，而不是重新选取', text: '计数过程中有帧开始发送，计数立即冻结；等空口重新空闲、规定的帧间间隔也已结束，它从冻结时的值继续，既不多减、也不少减。这不是细节，而是这套规则中公平性的唯一来源：已经等待的时间不会作废。如果改为“被打断就重新选取”，一台总是恰好被打断的站点就会始终排在后面。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '本轮仿真的第一次冻结（按比例绘制）',
      spec: backoffTiming(),
      caption: '两段计数都很短，冻结的那段很长。STA-1 在 480 µs 减到 5、489 µs 减到 4、498 µs 减到 3，邻居恰好在 498 µs 开始发送，于是它冻结在 3；邻居的帧在 746 µs 结束，确认帧在 790 µs 结束，一个 DIFS 持续到 824 µs，它才从同一个 3 继续递减，并在 851 µs 发出自己的帧。',
    },
    { heading: '本轮选取的退避值', text: '300 ms 内，这两台站点在窗口下限 CW = 15 时共选取 770 次，平均取值 7.15 个时隙。每个时隙是 9 µs，因此平均等待约 64 µs——接近两个 DIFS，而且每一轮长短不同。' },
    { kind: 'steps', heading: '随机选取与递减计数的完整过程', items: [
      '竞争窗口的初始值是下限 15，链路（link）上每一台站点都从这个值开始。',
      '当它需要等待的帧间间隔结束、而且这一次确实需要一次新的选取时，站点在 0 与 CW 之间均匀地随机选取一个整数，包含两端——CW 为 15 时共十六个可能值，零也是其中之一。',
      '介质（medium）每空闲满一个 9 µs 的时隙，这个计数就减一。计数减到零的那个时隙，就是站点开始发送的时隙。',
      '一旦介质变忙——可能是侦听到能量，也可能是它接收到的某一帧为它设置了预约倒计时——下一次减一就被取消，计数冻结在当前值。',
      '等介质重新空闲，它先等待规定的帧间间隔，再从同一个值继续；已经等待的部分完全保留。',
      '每发送一次，计数就会清空，下一帧需要重新选取——所以任何站点都不能不经重新竞争而连续发送两帧。',
    ] },
  ],
  limits: [
    { kind: 'model-value', text: '选取的退避值来自一条由种子派生的确定性随机数流：每个节点一条 splitmix32 子流（src/engine/rng.ts 的 fork，由场景种子在 simulation.ts 里派生）。所以同一个场景、同一个种子每次生成同一串数，770 次选取、平均 7.15 个时隙都是可复现的。真实空口做不到这一点——同一个房间运行两次不会给出同一串退避值，本课那些确切的计数只是这一条随机数流的结果。' },
    { kind: 'unmodelled', text: '「不丢失任何一个时隙」是精确成立的：介质一变忙就取消下一次减一的定时器，恢复空闲后再按同一个值重新调度（mac.ts 的 onCcaBusy 与 scheduleTick），全场共用一个纳秒时基。真实设备按自身偏差几十 ppm 的时钟计数时隙，而且判忙本身需要时间，它有可能多计或少计一个时隙——标准在时隙中留出余量，正是为了不让这种误差导致碰撞。' },
    { kind: 'unmodelled', text: '介质一恢复空闲，站点立即开始等待它的帧间间隔（onCcaIdle 当即记录时刻并恢复接入）。真实射频从接收切换回侦听、再确认信道确实空闲，本身需要几微秒，所以「空闲的那一刻」和「开始计数的那一刻」并不是同一时刻。' },
    { kind: 'out-of-scope', text: '这个场景里一次竞争成功只能发送一帧：站点不为帧标注业务类别，也没有传输机会（transmit opportunity, TXOP），所以每发一帧都要重新选取一次。现在的设备竞争成功一次可以连续发送多帧，退避在总时间中的占比远低于这里——本课算出的「平均等待约 64 µs」因此是传统 DCF 的开销，不是现代设备的开销。', until: 'txop' },
  ],
  sources: [
    '退避过程见 IEEE Std 802.11-2024 的 §10.3.4.3；aCWmin 15 与 aSlotTime 9 µs 见 §17.4.4。',
    '“介质忙时冻结、重新空闲之后继续计数”同样见 §10.3.4.3：退避计数只在介质被判为空闲满一个时隙时递减。',
    '本轮选取的那些值、770 这个组数，以及图中的每一个时刻，都是本仿真器的场景，可以通过随机种子复现；两台饱和站点与 1528 字节的帧同样如此。',
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
    '计数器（bo:n）只在信道空闲时递减，对方一发送就冻结，之后从同一个值继续——本轮共 770 组冻结与恢复，没有一组丢失过一个时隙。',
    '在第一次冻结处暂停，向后推进到恢复：中间隔着邻居的整帧、它的确认帧，还有一个 DIFS，而计数器的值始终没有变化。',
  ],
  tryThis: [
    '统计从一个 DIFS 结束到紧随其后那一帧开始之间的空闲时隙数。它总是等于那台站点在这个 DIFS 结束时剩余的退避计数；如果这次倒数从未被别的帧打断，这个数就是它最初选取的退避值。',
  ],
  quiz: [
    {
      q: '其他站点在发送时，一个计数器冻结在 7。恢复时它从几开始？',
      options: [
        '重新随机选取一个数',
        '7——正是它冻结时的值',
        '0，因为等待已经结束了',
      ],
      answer: 1,
      explain: '已经等待的时间不会作废。正是这一点，使等待已久的站点不会被刚开始竞争的站点超过。',
    },
    {
      q: '计数器为什么计数空闲时隙，而不是直接计数微秒？',
      options: [
        '因为微秒太短，硬件来不及计数',
        '因为要等待的是“信道空闲”的时间：空口一忙计数就应停止，而时隙正是判定一次空闲所需的时长',
        '因为标准里没有微秒这个单位',
      ],
      answer: 1,
      explain: '这个数表示“还需要经过多少个空闲时隙才能发送”。忙的时段不计入，所以它不可能是一段实际经过的时间。',
    },
  ],
}
