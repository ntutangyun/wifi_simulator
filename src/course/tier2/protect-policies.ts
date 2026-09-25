/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · the three ways of announcing, and CF-End.
 *
 * The second half of `txop-protect`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8). The
 * parent owns the announcement that covers a whole burst and what it buys; this
 * lesson owns the three named ways of writing it down — single, boundary,
 * multiple — the frame that hands unused time back, and the cheap announcement
 * that is useless in this house.
 *
 * The scene is the parent's, unchanged and undivided, and so are both variants —
 * the kit asserts the two variant lists are equal scenario for scenario
 * (`sameSceneAs: 'txop-protect'`), so the recorded hashes of this id are copies
 * of the parent's rather than new runs. It takes jumps 1 and 2 of the old list
 * (the first CF-End, the first one repeated by the access point); the parent
 * keeps the first RTS and the first collision.
 *
 * The procedure is the engine's own, in its order: `startExchange` in
 * src/engine/mac.ts (the `prot !== 'single'` branch that plans the burst and sets
 * `announcedEndNs`), `buildDataFrame` (§9.2.5.2: a data frame carries the TXOP
 * remainder only under `multiple`, and only while that remainder exceeds
 * SIFS + the response), and `releaseTxop` (CF-End only when the announcement
 * outruns the burst by more than SIFS + CF-End + one slot), with `onCfEnd` for
 * the access point's repeat and the NAV that is cleared by either copy.
 *
 * Every number quoted below is pinned in tests/course/protect-policies.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstCfEnd, firstCfEndRelay, J } from '../lessonKit'

/**
 * How far each policy's announcement reaches, on the run's own burst at
 * 0.736 ms, with that RTS as the zero point.
 *
 * Every span is a record or the engine's own arithmetic over one:
 *  - 这一串 — the RTS at 0–28, the CTS at 44–72, and the five exchanges from the
 *    first data frame at 88 to the last answer ending at 2 152.
 *  - 单次 — 416 µs from the moment the answer ends, which is what a CTS carries
 *    for one exchange of a 356 µs frame (2 × SIFS + 356 + 28) and what the
 *    single-protection run really prints in that field.
 *  - 边界 — the 2 456 µs the CTS carries here, from 72 to 2 528.
 *  - CF-End — the holder's copy at 2 168, the access point's at 2 212, and the
 *    hidden station's NAV_CLEAR at 2 240, which is 288 µs before the
 *    announcement would have expired.
 */
export function policyReachTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '这一串', spans: [
        { fromUs: 0, toUs: 28, label: 'RTS' },
        { fromUs: 44, toUs: 72, label: 'CTS' },
        { fromUs: 88, toUs: 2152, label: '五次交互', tone: 'accent' },
      ] },
      { label: '单次罩住', spans: [{ fromUs: 72, toUs: 488, label: '416 µs' }] },
      { label: '边界罩住', spans: [{ fromUs: 72, toUs: 2528, label: '2 456 µs', tone: 'accent' }] },
      { label: '还回去', spans: [{ fromUs: 2168, toUs: 2240, label: '两份 CF-End' }] },
    ],
    axis: { fromUs: 0, toUs: 2600, ticks: [0, 500, 1000, 1500, 2000], unit: 'µs（0 是那句提问）' },
  }
}

export const protectPolicies: Lesson = {
  id: 'protect-policies',
  module: 7,
  title: '三种预告方式，以及把时间还回去',
  why: '上一课的那句回答预告了整串帧，可“预告多少”其实有三种写法，标准给了它们三个名字：单次、边界、多重。而预告出去的时间，通常比这一串最后真正需要的更长——队列（queue）空了，或者下一帧已经塞不下。于是还有最后一件事要做：把没用完的那段时间还给整个房间。这一课我们把这三种写法排在一起看，再看一帧几个字节的小帧如何撤销一条已经装上的预约。',
  outcomes: [
    '说出三种预告方式各自预告到哪里为止，以及它们在本场景里跑出了什么结果',
    '解释 CF-End（contention-free end）做了什么，以及为什么接入点（access point, AP）要把它重复一遍',
    '说出 CTS-to-self（CTS to self）省下了什么，以及它在这间房子里为什么没用',
  ],
  needs: ['txop-protect'],
  terms: [
    { term: 'CF-End', plain: '几个字节的一帧，意思是“我提前结束了”：听见的人当场把这段预约作废' },
    { term: 'CTS-to-self', plain: '站点把“允许发送”那一帧发给自己的地址：不问任何人，直接把预告做了' },
  ],
  picture: [
    { kind: 'list', heading: '预告的三种说法', items: [
      '单次保护（single protection）：除了手上这一次交互，什么也不多说。远端站点（station, STA）一次只被告知一次交互，然后就径直数进了这一串剩下的部分。',
      '边界保护（boundary protection）：开头那一问一答——请求发送（request to send, RTS）与允许发送（clear to send, CTS）——把这一串预告到本轮末尾为止。本课的基础场景载入的就是这一种。',
      '多重保护（multiple protection）：开头同样是一问一答，而且每个数据帧（data frame）都携带剩余时间，于是错过那个回答的站点，也能从数据帧里把预约接上。',
    ] },
    { heading: '把时间还回去', text: '覆盖整串的预告，通常比这串帧最后真正需要的更长。于是持有者用几个字节把剩下的还回去，意思是“我提前结束了”——这就是 CF-End。听见的人当场把预约作废。可远处那个房间听不见持有者——于是接入点替它把这个 CF-End 重复一遍。这和上一课那个回答是同一个手法，只是方向反了过来。' },
    { kind: 'watch', jump: 0, heading: '看一条预约提前结束', text: '载入仿真，跳到第一个 CF-End（约 2.90 ms）。五次交互之后，预约还剩 376 µs，不够再发一帧加它的回答，于是持有者发出 CF-End；紧接着的那一帧是接入点重复的同一句。盯住远端站点的泳道：它那条紫条在 2.976 ms 收尾，而不是等到预告的 3.264 ms。' },
    { heading: '没人替你回答的时候', text: '有时候持有者只想要预告，不想要那次问答。它可以把那句“允许发送”直接发给自己的地址：这就是 CTS-to-self，本来两帧，现在一帧。代价少了一半——而它传得多远，和持有者自己的嗓门一模一样，也就是说，传不进远处那个房间。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '同一串帧，三种说法各罩住多长',
      spec: policyReachTiming(),
      caption: '零点取本轮 0.736 ms 那句提问。单次保护下，那个回答只预约到第一次交互做完为止（416 µs）；边界保护预约到本轮末尾（2 456 µs），可这一串 2 152 µs 就完了，于是两份 CF-End 把最后那 288 µs 还了回去。',
    },
    { kind: 'table', heading: '同样的三百毫秒，三种说法', head: [
      '300 ms 内的统计', '单次', '边界', '多重',
    ], rows: [
      ['碰撞次数', '46', '21', '21'],
      ['成功送达的数据帧', '212', '614', '614'],
      ['数据帧自己携带的 Duration，最长', '60 µs', '60 µs', '2.164 ms'],
      ['发出的 CF-End（连接入点重复的那份）', '0', '198', '198'],
    ] },
    { heading: '第三种说法多给了什么，又没给什么', text: '多重保护把整个剩余时间写进每一个数据帧，本轮最长可达 2.164 ms。这间房子里没人需要它——所有可能撞车的站点都已经听见了那个回答——所以它跑出来和边界保护完全一样，一次碰撞对一次碰撞，一帧送达对一帧送达。它要救的是另一种情形：某台站点恰好错过了开场那个回答，却听得见后面的数据帧。' },
    { kind: 'steps', heading: 'Duration 与 CF-End，引擎按什么顺序算', items: [
      '一轮开始时，持有者先看自己是哪一种策略。是单次，就只按“这一次交互”填写：一段停顿、那个回答，再加上这一帧——远端站点因此只被告知这么多。',
      '是边界或多重，它就把本轮能装下的交互先规划一遍；确实不止一次，就把开场那句提问的 Duration 写成整轮末尾减去提问自身，这里是 2 500 µs，回答则再扣掉一段停顿和它自己，写 2 456 µs。',
      '发数据帧时再分一次岔：多重保护下，只要“到本轮末尾还剩的时间”比“一段停顿加一个回答”更长，这一帧的 Duration 就写成那个剩余时间；否则就只写一段停顿加一个回答，也就是边界保护始终写的那个 44 到 60 µs。',
      '本轮结束、把信道交还时，如果预告出去的末尾比“此刻 + 一段停顿 + 一个 CF-End + 一个时隙（slot time）”还远，持有者就发出 CF-End；接入点收到非接入点发来的 CF-End，隔一段停顿再重复一遍。',
      '任何一台解出这两份中任一份的电台，当场把自己那条预约清零；两份都没解出来的，只能老老实实等到预告的末尾。',
    ] },
    { kind: 'table', heading: '这一串的收尾，一步一步', head: [
      '步骤', '数值',
    ], rows: [
      ['预告出去的预约管到', '3.264 ms'],
      ['最后一个回答落在', '2.888 ms'],
      ['已预告的预约还剩', '376 µs'],
      ['再做一次交互需要', '416 µs ✗'],
      ['持有者的 CF-End 发于', '2.904 ms'],
      ['接入点重复的那一份发于', '2.948 ms'],
      ['于是远端站点的预约结束于', '2.976 ms'],
      ['还回去的时间', '288 µs'],
    ] },
  ],
  deeper: [
    { heading: 'CTS-to-self 做不到的事', text: '把“允许发送”发给自己，省掉的是那次提问；在一屋子新旧混杂的设备里，这笔节省是实打实的。但在这间房子里，它什么也保护不了：这一帧传得和持有者发的其它东西一样远，远房间里的站点根本听不见，它的计数器照样往下走。预告再便宜，如果在危险所在之处听不见，就一文不值。' },
  ],
  sources: [
    'QoS 站点在单次、边界与多重保护下如何填写 Duration 字段，见 IEEE Std 802.11-2024 的 §9.2.5（尤其是 §9.2.5.2）。',
    'CF-End，以及“收到它的站点清零 NAV”这条规则，见 §10.23.2.10《TXOP 的截断》。标准是针对 S1G 接入点写明那次重复的；本仿真器让所有接入点都这么做，这是模型取值。',
    'CTS-to-self 是 §10.3.2.15 所列的 NAV 分发机制之一；标准正文明说它比 RTS/CTS 开销更低，但对隐藏节点更不稳健。',
    '上面每一个计数与时刻都是模型取值，靠本场景的随机种子即可复现，并非取自标准正文。',
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
    J('第一个 CF-End', firstCfEnd),
    J('第一个由接入点重复的 CF-End', firstCfEndRelay),
  ],
  observe: [
    '“第一个 CF-End”（≈ 2.90 ms）：五次交互之后，预约还剩 376 µs——不够再发一帧加它的回答。A 发出 CF-End，接入点隔一段停顿重复一遍，于是 B 的预约在 2.976 ms 结束，而不是 3.264 ms。整轮 300 ms 里这样的 CF-End 一共 198 帧，正好一半出自接入点。',
    '载入“多重保护”变体，悬停这一串中间的某个数据帧：它的 Duration 直达本轮末尾，最长 2.164 ms，而边界保护下只有 44 到 60 µs。',
  ],
  tryThis: [
    '把“单次保护”和“多重保护”两个变体各跑一遍，只盯住远端站点的泳道：单次那边它在每一串的中途醒来，多重那边它和边界一样一直紫到末尾。计数也完全一样——21 次碰撞、送达 614 帧——因为这间房子里没有谁会错过那个回答。',
  ],
  quiz: [
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
    {
      q: '在这间走廊房子里，多重保护比边界保护多买到了什么？',
      options: [
        '更少的碰撞：21 次降到 12 次',
        '什么也没多买：两边一次碰撞对一次碰撞，因为这里没人会错过那个回答',
        '更短的预约，于是空口更空',
      ],
      answer: 1,
      explain: '多重保护救的是“错过开场那个回答、却听得见数据帧”的站点。这个房间里唯一听不见持有者的那台，恰恰听得见接入点的回答。',
    },
  ],
}
