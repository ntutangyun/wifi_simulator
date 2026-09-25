/**
 * Wi-Fi Tier 2 · M3 · QoS and efficiency · Protecting a whole burst.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the hallway
 * house of `hidden`, but the winner now sends several frames in a row, so the
 * station that cannot hear it has a long window to blunder into instead of a
 * short one. One question and one answer at the start of the burst announce all
 * of it; CF-End hands back what the burst did not use; a CTS-to-self buys the
 * announcement without the question and is useless here. The costs and the
 * counts of the three policies are in `numbers`; the RTS-threshold corner and
 * what a CTS-to-self cannot do are in `deeper`; the clause numbers are in
 * `sources`.
 *
 * The scenario builder and its two variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/txop-protect.test.ts,
 * except the four counts of the 300 ms table and the observe list's timings,
 * which tests/course/lesson-claims.test.ts ("lesson 10 · protecting the burst")
 * has always held and still holds.
 */
import { type Lesson, hallwayHouse, node, sc, firstRts, firstCfEnd, firstCfEndRelay, firstCollision, J } from '../lessonKit'

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 2,
  title: '保护突发——一个回答管住整个突发',
  why: '抢到空口的站点（STA）可以多占一会儿，把好几帧连着发出去，而不是只发一帧。当屋里所有人都听得见所有人时，这是笔划算的买卖。可在一台站点听不见另一台的房子里，它就成了陷阱：一长串帧，无非就是给那位“聋着的”邻居留出了一大段可以撞进来的时间。隐藏节点那一课的解法依然管用，只是要瞄得更远——用远处那个房间听得见的声音，把整串帧一次性预告出去。',
  outcomes: [
    '说出有站点被隐藏时，为什么一串帧比单独一帧更危险',
    '说出是哪一帧把整串帧的预约送进了远处那个房间',
    '在时间轴上读出一条预约，并看着它提前结束',
    '对比三种预告策略各自的碰撞次数与空口开销',
  ],
  needs: ['nav', 'hidden', 'txop'],
  terms: [
    { term: 'protection', plain: '事先说清自己要占用空口多久，好让那些听不见你的站点照样保持安静' },
    { term: 'CF-End', plain: '几个字节的一帧，意思是“我提前结束了”：听见的人当场把这段预约作废' },
    { term: 'CTS-to-self', plain: '站点把“允许发送”那一帧发给自己的地址：不问任何人，直接把预告做了' },
  ],
  picture: [
    { heading: '同一间房子，现在成串地发', text: '这还是隐藏节点那一课的走廊房子：两头的房间里各一台站点，接入点（AP）在中间的走廊里，两台站点谁也听不见对方一丁点动静。新的地方在于，赢家不再发一帧就收手：它占住空口，把好几帧连着发出去。而对那个什么也听不见的远房间来说，危险不再是一瞬间，而是一大段时间。' },
    { heading: '预告的是整串，而不是下一帧', text: '发这一串之前，持有者照样先发出那句简短的提问，接入点也照样大声回答，于是两个房间都听得见这个回答。现在关键在于：这个回答预告了多少——只是马上要发的那一帧，还是这一串里的每一帧。一口气把整串预告出去，就是这一课说的保护；一个远端站点是安安静静把整串等完，还是在半途中醒来，差别就在这里。' },
    { kind: 'watch', jump: 0, heading: '看远处那个房间安静下来', text: '载入仿真，跳到第一次提问。盯住远端站点的泳道：它下方出现一条预约，一直延伸到那串帧的末尾——而这一串它连一帧都听不见。然后载入“单次保护”变体，再看同一条泳道：这一串还没发完，它就醒了。' },
    { heading: '把时间还回去', text: '覆盖整串的预告，通常比这串帧最后真正需要的更长：队列空了，或者下一帧已经塞不下。于是持有者用几个字节把剩下的还回去，意思是“我提前结束了”——这就是 CF-End。听见的人当场把预约作废。可远处那个房间听不见持有者——于是接入点替它把这个 CF-End 重复一遍。这和那个回答是同一个手法，只是方向反了过来。' },
    { kind: 'list', heading: '预告的三种说法', items: [
      '单次：除了手上这一帧，什么也不多说。远端站点一次只被告知一次交互，然后就径直数进了这一串剩下的部分。',
      '边界：开头一问一答，把这一串预告到末尾为止。本课载入的就是这种。',
      '多重：开头同样是一问一答，而且每个数据帧都携带剩余时间，于是错过那个回答的站点，也能从数据帧里把预约接上。',
    ] },
    { heading: '没人替你回答的时候', text: '有时候持有者只想要预告，不想要那次问答。它可以把“允许发送”那一帧直接发给自己的地址：这就是 CTS-to-self，本来两帧，现在一帧。代价少了一半——而它传得多远，和持有者自己的嗓门一模一样，也就是说，传不进远处那个房间。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样的三百毫秒，三种说法', head: [
      '300 ms 内的统计', '单次', '边界', '多重',
    ], rows: [
      ['碰撞次数', '46', '21', '21'],
      ['成功送达的数据帧', '212', '614', '614'],
      ['重传', '112', '47', '47'],
      ['丢弃帧数', '6', '1', '1'],
    ] },
    { kind: 'table', heading: '用来预告的那些帧，花了多少，换回什么', head: [
      '每 300 ms', '单次', '边界', '多重',
    ], rows: [
      ['花在提问、回答与 CF-End 上的空口时间', '14.9 ms', '14.3 ms', '14.3 ms'],
      ['每送达一帧所花的空口时间', '1281 µs', '422 µs', '422 µs'],
      ['隐藏站点装上的预约，平均有多长', '1.05 ms', '2.45 ms', '2.45 ms'],
    ] },
    { heading: '同样的账单，瞄得更准', text: '保护本身并不是花钱的地方：两种策略花在预告帧上的空口时间都在二十分之一上下，边界还略少一点，因为一次开场就管住了一整串。变的是覆盖范围：隐藏站点装上的预约平均是 2.45 ms，而不是 1.05 ms，于是它把整串等完；整个房间送达的帧数接近三倍，而每送达一帧所花的空口时间只有原来的三分之一。' },
    { heading: '第三种策略多给了什么，又没给什么', text: '多重保护把整个剩余时间写进每一个数据帧，最长可达 2.164 ms。这间房子里没人需要它——所有可能撞车的站点都已经听见了那个回答——所以它跑出来和边界保护完全一样，一次碰撞对一次碰撞。' },
    { heading: '剩下的那些碰撞', text: '活下来的 21 次碰撞里，有 18 次是两句提问撞在一起：两台隐藏站点的起跑时刻，相差不到一句提问那么长，于是各损失 20 字节，而不是一整串帧。只有 3 次撞上了正在进行中的数据帧。这正是隐藏节点那一课里的那笔交易，从一帧扩展到了一整串。' },
    { kind: 'steps', heading: '一句提问怎么管住整串', items: [
      '发第一帧之前，持有者先把本轮规划一遍：把这一类队列里排着的帧走一遍，把那些仍能在上限之内结束的交互加起来——这里的上限是 2 528 µs。能装下不止一次交互，就真有一串值得预告。',
      '它先发出那句简短的提问：一帧 20 字节的 RTS，用全屋都解得开的速率发出。它的 Duration 字段写的是整轮减去提问自身的 28 µs：2 500 µs。',
      '每一台解出这句提问的电台，都把这个值装成一条预约。隔一段停顿，接入点回一帧 CTS，里面写的是扣掉这段停顿和回答自身之后剩下的 2 456 µs——而这个回答，是本轮里远房间唯一听得见的一帧。',
      '接下来这一串就一次接一次地交互，中间只隔一段停顿。每个数据帧自己的 Duration 只管到它自己的回答为止——这一帧是 44 µs，本轮最多也就 60 µs——因为远房间手上那条预约已经盖到了末尾。',
      '等到队列空了，或者下一次交互再也装不下了，持有者就把剩下的还回去：只要剩下的比“一段停顿 + 一个 CF-End + 一个时隙”还长，它就发出 CF-End，接入点隔一段停顿再重复一遍；两份里听见任一份的人，当场把预约作废。',
    ] },
    { kind: 'table', heading: '从 0.736 ms 开始的那一串，一步一步', head: [
      '步骤', '数值',
    ], rows: [
      ['提问发出，Duration 2 500 µs', '0.736 ms'],
      ['回答到手，Duration 2 456 µs', '0.808 ms'],
      ['于是远端站点的预约一直管到', '3.264 ms'],
      ['五次交互，每次 416 µs；最后一个回答落在', '2.888 ms'],
      ['已预告的预约还剩', '376 µs'],
      ['再做一次交互需要', '416 µs ✗'],
      ['CF-End 发于 2.904 ms，又被重复一遍，预约结束于', '2.976 ms'],
    ] },
  ],
  deeper: [
    { heading: '完全得不到预告的那些轮次', text: '只有当这一轮确实计划了不止一次交互时，持有者才会发出开场那句提问——没有一串要发，也就没有什么要保护。于是只装得下一帧的那种轮次，只有当这一帧超过本站的 RTS 门限时才受保护，这正是本场景把门限设成 500 字节的原因。把它调到 3000、高过这里的每一帧，那些轮次就裸奔上阵：碰撞从 21 次升到 80 次，送达从 614 帧降到 344 帧。裸奔的恰恰是慢帧——其中一帧占了 1.9 ms 的空口，也就给了隐藏站点最长的一段可乘之机。' },
    { heading: 'CTS-to-self 做不到的事', text: '把“允许发送”发给自己，省掉的是那次提问；在一屋子新旧混杂的设备里，这笔节省是实打实的。但在这间房子里，它什么也保护不了：这一帧传得和持有者发的其它东西一样远，远房间里的站点根本听不见，它的计数器照样往下走。预告再便宜，如果在危险所在之处听不见，就一文不值。' },
  ],
  sources: [
    'QoS 站点在单次与多重保护下如何填写 Duration 字段，见 IEEE Std 802.11-2024 的 §9.2.5（尤其是 §9.2.5.2）；RTS/CTS 交互本身见 §10.3.2.9。',
    'CF-End，以及“收到它的站点清零 NAV”这条规则，见 §10.23.2.10《TXOP 的截断》。标准是针对 S1G 接入点写明那次重复的；本仿真器让所有接入点都这么做，这是模型取值。',
    'CTS-to-self 是 §10.3.2.15 所列的 NAV 分发机制之一；标准正文明说它比 RTS/CTS 开销更低，但对隐藏节点更不稳健。',
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
    J('第一个 CF-End', firstCfEnd),
    J('第一个由接入点重复的 CF-End', firstCfEndRelay),
    J('第一次碰撞', firstCollision),
  ],
  observe: [
    '“第一个 RTS”：两台站点都在 t = 0 开口发问，撞在一起。A 在 0.736 ms 的第三次尝试成功了，预约 2500 µs；接入点在 0.780 ms 的回答携带 2456 µs——正好少了一个 SIFS 和它自身。隐藏站 B 的泳道一直紫到 3.264 ms，尽管 B 从来听不到 A。',
    '“第一个 CF-End”（≈ 2.90 ms）：五次交互之后，预约还剩 376 µs——不够再发一帧加它的回答。A 发出 CF-End，接入点在一个 SIFS 之后重复一遍，于是 B 的预约在 2.976 ms 结束，而不是 3.264 ms。',
    '“第一次碰撞”落在 t = 28 µs，那是同时开口的两句提问结束的时刻，而不是报废了一整串。再载入“单次保护”：远端站点在这一串的中途醒来，它那 29 次数据帧碰撞里，有 24 次都不是某一轮的第一次交互。',
  ],
  tryThis: [
    '载入“多重保护”变体，悬停这一串中间的某个数据帧：它的 Duration 现在直达本轮末尾，最长 2.164 ms，而边界保护下只有 60 µs。但计数一点没变——还是 21 次碰撞，还是送达 614 帧。',
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
      q: '一串帧比它预告的预约提前不少就结束了。会发生什么？',
      options: [
        '什么也不发生——所有人把预约等完',
        '持有者发出 CF-End，接入点再重复一遍',
        '持有者再问一次',
      ],
      answer: 1,
      explain: 'CF-End 把没用掉的时间还回去。听见任意一份的站点作废预约；两份都没听见的，只能等到预告的末尾。',
    },
  ],
}
