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
      { from: 'sta-1', to: 'ap', label: 'RTS：预约 2 500 µs', at: '0.736 ms', tone: 'accent' },
      { from: 'ap', to: 'sta-1', label: 'CTS：2 456 µs', at: '0.780 ms', tone: 'accent' },
      { from: 'sta-2', to: 'sta-2', label: '预约到 3.264 ms', at: '0.808 ms' },
      { from: 'sta-1', to: 'ap', label: '五次交互，各 416 µs', at: '0.824 ms' },
      { from: 'ap', to: 'sta-1', label: '最后一个确认帧', at: '2.888 ms' },
    ],
  }
}

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 7,
  title: '保护突发——用 RTS/CTS 预约整串',
  why: '竞争成功的站点（STA）可以多占用一段时间，把好几帧连续发出，而不是只发一帧。当屋里每台站点都能收到其他所有站点时，这样做很有收益。但在一台站点收不到另一台的房子里，它就有了风险：一长串帧，等于给那台收不到你发送的邻居留出了一大段可能发生碰撞的时间。隐藏节点（hidden station）那一课的解决办法仍然有效，只是需要覆盖更长的时间。持有者先发送一帧请求发送（request to send, RTS），在其中写入整轮要占用的时间；接入点（AP）以全屋都能解调的速率回复一帧允许发送（clear to send, CTS），把剩余时间重复一遍。这帧 CTS 是远处那个房间唯一能收到的一帧，它在那里设置的预约一直持续到整串最后一个确认之后。一次就预告整串的时长，标准称为边界保护（boundary protection）；在只预告下一次交互的单次保护（single protection）下，远端的预约在中途就到期，它恢复竞争，与正在进行的数据帧（data frame）发生碰撞。同样的三百毫秒里，边界保护使碰撞减少一半以上，送达的帧接近三倍，每送达一帧的空口时间（airtime）只有三分之一，而用于这些不承载数据的短帧的开销两边相近。剩余的碰撞大多是两帧 RTS 相互碰撞，各自只损失一帧 RTS，而不是一整串帧。',
  outcomes: [
    '说明存在隐藏站点时，为什么一串帧比单独一帧风险更大',
    '说明是哪一帧把整串帧的预约传到了远处那个房间',
    '在时间轴上读出一条预约，并说明它持续到何时',
  ],
  // §6 of the re-pacing plan: the question-and-answer exchange moved to `rts-cts`, the half
  // that owns it, so this edge names that half rather than its parent.
  needs: ['nav', 'rts-cts', 'txop'],
  terms: [
    { term: 'protection', plain: '事先声明自己要占用空口多长时间，使那些收不到你发送的站点也保持静默' },
  ],
  picture: [
    { heading: '同一间房子，现在连续发送多帧', text: '这还是隐藏节点那一课的走廊房子：两头的房间里各一台站点，接入点（AP）在中间的走廊里，两台站点都完全收不到对方。不同之处在于，竞争成功的站点不再发一帧就停止：它占用空口，把好几帧连续发出。而对那个什么也收不到的远处房间来说，风险不再是一瞬间，而是一大段时间。' },
    { heading: '预告的是整串，而不是下一帧', text: '发送这一串之前，持有者仍然先发出一帧简短的请求发送（request to send, RTS）；接入点仍然以全屋都能解调的速率回复一帧允许发送（clear to send, CTS），于是两个房间都能收到这帧 CTS。现在关键在于：这帧 CTS 预告了多长时间——只是马上要进行的那一次交互——一帧数据加一个确认帧（acknowledgement, ACK）——还是这一串里的每一帧。一次预告整串的时长，这就是本课说的保护，标准称为边界保护（boundary protection）；一个远端站点是保持静默直到整串结束，还是在中途就恢复竞争，差别就在这里。' },
    { kind: 'watch', jump: 0, heading: '看远处那个房间保持静默', text: '载入仿真，跳到第一个 RTS。观察远端站点的泳道：它下方出现一条预约，一直延伸到那串帧的末尾——而这一串它一帧都收不到。然后载入单次保护（single protection）变体，再看同一条泳道：这一串还没发完，它那条预约就已经到期。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '0.736 ms 那一串：一次 RTS/CTS 交互覆盖整串',
      spec: protectSequence(),
      caption: '隐藏站 B 始终收不到 A。它那条预约是根据接入点的 CTS 设置的——本轮里它唯一能解调的一帧——一直持续到 3.264 ms，而 A 的五次交互到 2.888 ms 才结束。',
    },
    { kind: 'table', heading: '同样的三百毫秒，预告一次交互还是预告整串', head: [
      '300 ms 内的统计', '单次', '边界',
    ], rows: [
      ['碰撞次数', '46', '21'],
      ['成功送达的数据帧', '212', '614'],
      ['重传（retry）', '112', '47'],
      ['丢弃帧数', '6', '1'],
    ] },
    { kind: 'table', heading: '用于预告的那些帧：开销与收益', head: [
      '每 300 ms', '单次', '边界',
    ], rows: [
      ['用于 RTS、CTS 与结束短帧的空口时间', '14.9 ms', '14.3 ms'],
      ['每送达一帧占用的空口时间', '1281 µs', '422 µs'],
      ['隐藏站点设置的预约的平均时长', '1.05 ms', '2.45 ms'],
    ] },
    { heading: '同样的开销，覆盖更准确', text: '保护本身并不是开销的主要来源：两种策略用于这些不承载数据的短帧的空口时间（airtime）都在二十分之一上下，边界保护还略少一些，因为一次起始交互就覆盖了一整串。改变的是覆盖范围：隐藏站点设置的预约平均是 2.45 ms，而不是 1.05 ms，于是它一直等到整串结束；整个房间送达的帧数接近三倍，而每送达一帧占用的空口时间只有原来的三分之一。' },
    { kind: 'steps', heading: '一帧 RTS 如何覆盖整串', items: [
      '发送第一帧之前，持有者先规划本轮：逐一检查这一类队列（queue）中等待的帧，把那些仍能在上限之内结束的交互的时长累加——这里的上限是 2 528 µs。能容纳不止一次交互，才确实有一串需要预告。',
      '它先发出一帧 20 字节的 RTS，以全屋都能解调的速率发送。它的 Duration 字段写的是整轮减去 RTS 自身的 28 µs：2 500 µs。',
      '每一台解出这帧 RTS 的电台，都按这个值设置一条预约。间隔一段时间后，接入点回复一帧 CTS，其中写的是扣除这段间隔和 CTS 自身之后剩余的 2 456 µs——而这帧 CTS，是本轮里远处房间唯一能收到的一帧。',
      '接下来这一串逐次进行交互，中间只有一段短间隔。每个数据帧（data frame）自己的 Duration 只覆盖到它自己的确认为止——这一帧是 44 µs，本轮最多也只有 60 µs——因为远处房间已有的那条预约已经覆盖到了末尾。',
    ] },
    { kind: 'table', heading: '从 0.736 ms 开始的那一串，逐步说明', head: [
      '步骤', '数值',
    ], rows: [
      ['RTS 发出，Duration 2 500 µs', '0.736 ms'],
      ['收到 CTS，Duration 2 456 µs', '0.808 ms'],
      ['于是远端站点的预约一直持续到', '3.264 ms'],
      ['五次交互，每次 416 µs；最后一个确认落在', '2.888 ms'],
      ['这一串从 RTS 到最后一个确认，一共', '2 152 µs'],
      ['于是预告的时间还多出', '376 µs'],
    ] },
    { heading: '剩余的那些碰撞', text: '剩余的 21 次碰撞里，有 18 次是两帧 RTS 相互碰撞：两台隐藏站点开始发送的时刻相差不到一帧 RTS 的时长，于是各损失 20 字节，而不是一整串帧。只有 3 次与正在进行中的数据帧发生碰撞。这正是隐藏节点那一课里的那种取舍，从一帧扩展到了一整串。下一课接着讨论三件事：末尾那多出来的 376 µs 如何用一帧 CF-End（contention-free end）释放；把整个剩余时间写进每一帧的多重保护（multiple protection）额外带来了什么；以及为什么 CTS-to-self（CTS to self）在这间房子里帮不上忙。' },
  ],
  deeper: [
    { heading: '完全得不到预告的那些轮次', text: '只有当这一轮确实计划了不止一次交互时，持有者才会先发出 RTS——没有一串要发，也就无需保护。于是只容纳得下一帧的那种轮次，只有当这一帧超过本站的 RTS 门限时才受保护，这正是本场景把门限设成 500 字节的原因。把它调到 3000、高过这里的每一帧，那些轮次就完全没有保护：碰撞从 21 次升到 80 次，送达从 614 帧降到 344 帧。失去保护的恰恰是慢帧——其中一帧占了 1.9 ms 的空口，也就给隐藏站点留出了最长的一段可能发生碰撞的时间。' },
  ],
  limits: [
    { kind: 'threshold', text: '预告能否保护这一串，只取决于远端站点有没有解出那一帧，而「解出」在引擎里是一道硬门限：达到门限就一定收到，差一点就一定收不到。真实接收机在门限附近的行为是概率性的，同一条预约有时能设置、有时不能。于是那两列计数（46 对 21 次碰撞）的对比比真实测量更分明。' },
    { kind: 'unmodelled', text: '所有站点的 NAV 都是理想的：Duration 字段里的数被原样记下、按时清零，既不会算错也不会漏（mac.ts 的 updateNav）。真实设备会遇到把 Duration 写错或虚报的对端，标准里也因此有一整套 NAV 的纠错与提前释放规则。这里一条预约一旦设置就必定被严格遵守。' },
    { kind: 'model-value', text: '本场景把 RTS 门限设成 500 字节、把两台站点的保护策略写成「边界」，这都是场景里的配置，不是协商得到的：引擎不发信标、不做关联，也没有任何地方让两端商定要不要保护、用哪一种。真实设备各自按自己的驱动决定，同一个房间里常常是几种策略并存。' },
    { kind: 'out-of-scope', text: '这间走廊房子里只有两台互相收不到的站点，而且它们互相接收到的电平、到接入点的电平都是定数。真实的隐藏关系是时变的：两台站点有时能收到对方，有时收不到，于是保护的收益远不如这里稳定。编辑器的「时变链路（衰落）」一节可以打开电平的起伏，本课的三个场景都没有打开。' },
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
    '“第一个 RTS”：两台站点都在 t = 0 发出 RTS，发生碰撞。A 在 0.736 ms 的第三次尝试成功了，预约 2500 µs；接入点在 0.780 ms 的 CTS 携带 2456 µs——正好少了一个短帧间间隔（short interframe space, SIFS）和 CTS 自身。隐藏站 B 的泳道一直显示紫色到 3.264 ms，尽管 B 始终收不到 A。',
    '“第一次碰撞”落在 t = 28 µs，那是同时发出的两帧 RTS 结束的时刻，而不是整串都失败。再载入“单次保护”：远端站点那条预约在这一串的中途就到期了，它那 29 次数据帧碰撞里，有 24 次都不是某一轮的第一次交互。',
  ],
  tryThis: [
    '在编辑器中打开本场景，把两台站点的突发关闭再重新载入。每一帧又要各自参与竞争，没有哪台站点能连续两帧占用空口，也就没有突发需要保护了。',
  ],
  quiz: [
    {
      q: '隐藏站 B 始终收不到 A。是哪一帧使 B 在 A 的整串帧期间保持静默？',
      options: [
        'A 的 RTS',
        '接入点的 CTS',
        'A 的第一个数据帧',
      ],
      answer: 1,
      explain: 'B 只能收到接入点。接入点的 CTS 把 A 的预约重复了一遍，而在边界保护下，这段预约一直持续到这一串的末尾。',
    },
    {
      q: '同样一台收不到你的邻居，为什么“一串帧”比“单独一帧”更危险？',
      options: [
        '一串帧发得更快，更容易出错',
        '它给那台收不到的站点留出的可能发生碰撞的时间长得多：这里是 2 ms，而不是 0.4 ms',
        '一串帧里的校验更弱',
      ],
      answer: 1,
      explain: '风险的长度就是“它可能在其间开始发送”的那段时间。占用空口的时间越长，这段时间也就越长——除非你预告整串的时长。',
    },
  ],
}
