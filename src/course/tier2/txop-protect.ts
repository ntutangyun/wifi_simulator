/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · announcing a whole burst with one RTS/CTS.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8): the
 * first half of the old lesson. What this half owns is the announcement itself —
 * one question, one answer, and a reservation that covers every frame of the
 * burst instead of the next one — and what that buys in the hallway house: 46
 * collisions become 21, 212 delivered frames become 614.
 *
 * The three named policies, CF-End and CTS-to-self are `protect-policies`, which
 * loads this same scene and the same two variants (`sameSceneAs: 'txop-protect'`).
 * The seam is real: this lesson asks "does the announcement cover the burst?",
 * and that one asks "in which of the three ways, and how is the unused time given
 * back?".
 *
 * Arriving here from `txop` (§5.1.4): the Duration that telegraphs a burst was
 * taught in that lesson's `deeper` as well as here; this lesson is now its only
 * home, and `txop` keeps one forward-pointing clause.
 *
 * The scenario builder and its two variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/txop-protect.test.ts,
 * except the four counts of the 300 ms table and the observe list's timings,
 * which tests/course/lesson-claims.test.ts ("lesson 10 · protecting the burst")
 * has always held and still holds.
 */
import type { SequenceSpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstRts, firstCollision, J } from '../lessonKit'

/**
 * The run's own burst at 0.736 ms, as an exchange: who says what, when.
 *
 * Every row is a record of the base run — the RTS at 736 µs with Duration 2 500,
 * the access point's CTS at 780 with 2 456, the NAV_SET at the hidden station at
 * 808 that runs to 3 264, the first of five data frames at 824, and the last
 * answer at 2 888 — and `txop-protect.test.ts` reads each one back out of this
 * spec. The far station is drawn as its own column because its silence is the
 * whole point: the only thing it ever does in this figure is load a reservation
 * from a frame that was addressed to somebody else.
 */
export function protectSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-2', label: '隐藏站 B' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-1', label: '隐藏站 A' },
    ],
    messages: [
      { from: 'sta-1', to: 'ap', label: 'RTS：还要 2 500 µs', at: '0.736 ms', tone: 'accent' },
      { from: 'ap', to: 'sta-1', label: 'CTS：2 456 µs', at: '0.780 ms', tone: 'accent' },
      { from: 'sta-2', to: 'sta-2', label: '预约到 3.264 ms', at: '0.808 ms' },
      { from: 'sta-1', to: 'ap', label: '五次交互，各 416 µs', at: '0.824 ms' },
      { from: 'ap', to: 'sta-1', label: '最后一个确认', at: '2.888 ms' },
    ],
  }
}

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 7,
  title: '保护突发——一问一答，预约整串',
  why: '抢到空口的站点（STA）可以多占一会儿，把好几帧连着发出去，而不是只发一帧。当屋里所有人都听得见所有人时，这是笔划算的买卖。可在一台站点听不见另一台的房子里，它就成了陷阱：一长串帧，无非就是给那位“聋着的”邻居留出了一大段可以撞进来的时间。隐藏节点（hidden station）那一课的解法依然管用，只是要瞄得更远——用远处那个房间听得见的声音，把整串帧一次性预告出去。',
  outcomes: [
    '说出有站点被隐藏时，为什么一串帧比单独一帧更危险',
    '说出是哪一帧把整串帧的预约送进了远处那个房间',
    '在时间轴上读出一条预约，并说出它覆盖到哪里为止',
  ],
  // §6 of the re-pacing plan moves `hidden` to `rts-cts`, the half that will own the
  // question-and-answer exchange; that lesson is batch 4's and is not registered yet, so
  // the edge still names the lesson that can be named.
  needs: ['nav', 'hidden', 'txop'],
  terms: [
    { term: 'protection', plain: '事先说清自己要占用空口多久，好让那些听不见你的站点照样保持安静' },
  ],
  picture: [
    { heading: '同一间房子，现在成串地发', text: '这还是隐藏节点那一课的走廊房子：两头的房间里各一台站点，接入点（AP）在中间的走廊里，两台站点谁也听不见对方一丁点动静。新的地方在于，赢家不再发一帧就收手：它占住空口，把好几帧连着发出去。而对那个什么也听不见的远房间来说，危险不再是一瞬间，而是一大段时间。' },
    { heading: '预告的是整串，而不是下一帧', text: '发这一串之前，持有者照样先发出那句简短的提问，也就是请求发送（request to send, RTS）；接入点照样大声回答一句允许发送（clear to send, CTS），于是两个房间都听得见这个回答。现在关键在于：这个回答预告了多少——只是马上要发的那一次交互——一帧数据加一个确认帧（acknowledgement, ACK）——还是这一串里的每一帧。一口气把整串预告出去，这就是本课说的保护，标准里叫边界保护（boundary protection）；一个远端站点是安安静静把整串等完，还是在半途中醒来，差别就在这里。' },
    { kind: 'watch', jump: 0, heading: '看远处那个房间安静下来', text: '载入仿真，跳到第一次提问。盯住远端站点的泳道：它下方出现一条预约，一直延伸到那串帧的末尾——而这一串它连一帧都听不见。然后载入单次保护（single protection）变体，再看同一条泳道：这一串还没发完，它就醒了。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '0.736 ms 那一串，一问一答管住全部',
      spec: protectSequence(),
      caption: '隐藏站 B 从来听不见 A。它那条预约是从接入点的回答里装上的——本轮里它唯一解得开的一帧——一直管到 3.264 ms，而 A 的五次交互到 2.888 ms 才结束。',
    },
    { kind: 'table', heading: '同样的三百毫秒，预告一次交互还是预告整串', head: [
      '300 ms 内的统计', '单次', '边界',
    ], rows: [
      ['碰撞次数', '46', '21'],
      ['成功送达的数据帧', '212', '614'],
      ['重传（retry）', '112', '47'],
      ['丢弃帧数', '6', '1'],
    ] },
    { kind: 'table', heading: '用来预告的那些帧，花了多少，换回什么', head: [
      '每 300 ms', '单次', '边界',
    ], rows: [
      ['花在提问、回答与收尾小帧上的空口时间', '14.9 ms', '14.3 ms'],
      ['每送达一帧所花的空口时间', '1281 µs', '422 µs'],
      ['隐藏站点装上的预约，平均有多长', '1.05 ms', '2.45 ms'],
    ] },
    { heading: '同样的账单，瞄得更准', text: '保护本身并不是花钱的地方：两种策略花在这些不载数据的小帧上的空口时间（airtime）都在二十分之一上下，边界还略少一点，因为一次开场就管住了一整串。变的是覆盖范围：隐藏站点装上的预约平均是 2.45 ms，而不是 1.05 ms，于是它把整串等完；整个房间送达的帧数接近三倍，而每送达一帧所花的空口时间只有原来的三分之一。' },
    { kind: 'steps', heading: '一句提问怎么管住整串', items: [
      '发第一帧之前，持有者先把本轮规划一遍：把这一类队列（queue）里排着的帧走一遍，把那些仍能在上限之内结束的交互加起来——这里的上限是 2 528 µs。能装下不止一次交互，就真有一串值得预告。',
      '它先发出那句简短的提问：一帧 20 字节的 RTS，用全屋都解得开的速率发出。它的 Duration 字段写的是整轮减去提问自身的 28 µs：2 500 µs。',
      '每一台解出这句提问的电台，都把这个值装成一条预约。隔一段停顿，接入点回一帧 CTS，里面写的是扣掉这段停顿和回答自身之后剩下的 2 456 µs——而这个回答，是本轮里远房间唯一听得见的一帧。',
      '接下来这一串就一次接一次地交互，中间只隔一段停顿。每个数据帧（data frame）自己的 Duration 只管到它自己的回答为止——这一帧是 44 µs，本轮最多也就 60 µs——因为远房间手上那条预约已经盖到了末尾。',
    ] },
    { kind: 'table', heading: '从 0.736 ms 开始的那一串，一步一步', head: [
      '步骤', '数值',
    ], rows: [
      ['提问发出，Duration 2 500 µs', '0.736 ms'],
      ['回答到手，Duration 2 456 µs', '0.808 ms'],
      ['于是远端站点的预约一直管到', '3.264 ms'],
      ['五次交互，每次 416 µs；最后一个回答落在', '2.888 ms'],
      ['这一串从提问到最后一个回答，一共', '2 152 µs'],
      ['于是预告出去的时间还多出', '376 µs'],
    ] },
    { heading: '剩下的那些碰撞', text: '活下来的 21 次碰撞里，有 18 次是两句提问撞在一起：两台隐藏站点的起跑时刻，相差不到一句提问那么长，于是各损失 20 字节，而不是一整串帧。只有 3 次撞上了正在进行中的数据帧。这正是隐藏节点那一课里的那笔交易，从一帧扩展到了一整串。下一课接着办三件事：末尾那多出来的 376 µs 怎么用一帧 CF-End（contention-free end）还回去；把整个剩余时间写进每一帧的多重保护（multiple protection）多买到了什么；以及为什么 CTS-to-self（CTS to self）在这间房子里帮不上忙。' },
  ],
  deeper: [
    { heading: '完全得不到预告的那些轮次', text: '只有当这一轮确实计划了不止一次交互时，持有者才会发出开场那句提问——没有一串要发，也就没有什么要保护。于是只装得下一帧的那种轮次，只有当这一帧超过本站的 RTS 门限时才受保护，这正是本场景把门限设成 500 字节的原因。把它调到 3000、高过这里的每一帧，那些轮次就裸奔上阵：碰撞从 21 次升到 80 次，送达从 614 帧降到 344 帧。裸奔的恰恰是慢帧——其中一帧占了 1.9 ms 的空口，也就给了隐藏站点最长的一段可乘之机。' },
  ],
  sources: [
    'QoS 站点在单次与多重保护下如何填写 Duration 字段，见 IEEE Std 802.11-2024 的 §9.2.5（尤其是 §9.2.5.2）；RTS/CTS 交互本身见 §10.3.2.9。',
    '“一个 PPDU 连同它的响应必须装进 TXOP 上限之内”见 §10.23.2.8；各接入类别的上限见 Table 9-194。',
    '上面每一个计数、平均值与时刻都是模型取值，靠本场景的随机种子即可复现，并非取自标准正文。',
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
    { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
  ], { rtsThresholdBytes: 500 }),
  variants: [
    {
      label: '单次保护（逐次交换）',
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
      ], { rtsThresholdBytes: 500 }),
    },
    {
      label: '多重保护（数据帧携带剩余时间）',
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
        { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('第一个 RTS', firstRts),
    J('第一次碰撞', firstCollision),
  ],
  observe: [
    '“第一个 RTS”：两台站点都在 t = 0 开口发问，撞在一起。A 在 0.736 ms 的第三次尝试成功了，预约 2500 µs；接入点在 0.780 ms 的回答携带 2456 µs——正好少了一个短帧间间隔（short interframe space, SIFS）和它自身。隐藏站 B 的泳道一直紫到 3.264 ms，尽管 B 从来听不到 A。',
    '“第一次碰撞”落在 t = 28 µs，那是同时开口的两句提问结束的时刻，而不是报废了一整串。再载入“单次保护”：远端站点在这一串的中途醒来，它那 29 次数据帧碰撞里，有 24 次都不是某一轮的第一次交互。',
  ],
  tryThis: [
    '在编辑器中打开本场景，把两台站点的突发关掉再重新载入。每一帧又要各自去竞争，没有哪台站点能连着两帧占住空口，也就没有什么突发需要保护了。',
  ],
  quiz: [
    {
      q: '隐藏站 B 从来听不见 A。是哪一帧让 B 在 A 的整串帧期间保持安静？',
      options: [
        'A 的提问',
        '接入点的回答',
        'A 的第一个数据帧',
      ],
      answer: 1,
      explain: 'B 只听得见接入点。它的回答把 A 的预约重复了一遍，而在边界保护下，这段预约一直管到这一串的末尾。',
    },
    {
      q: '同样一台听不见你的邻居，为什么“一串帧”比“单独一帧”更危险？',
      options: [
        '一串帧发得更快，更容易出错',
        '它给那台听不见的站点留出的可乘之机长得多：这里是 2 ms，而不是 0.4 ms',
        '一串帧里的校验更弱',
      ],
      answer: 1,
      explain: '危险的长度就是“它可能在里面开口”的那段时间。占住空口的时间越长，这段时间也就越长——除非你把整串都预告出去。',
    },
  ],
}
