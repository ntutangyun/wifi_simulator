/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · Slotted random access.
 *
 * Standard-first since 2026-11-11 (the shape `@uwb-contention` set): ① the time-slot based random
 * and scheduled access of P802.11bp, with the PDT clause and the motion behind each rule; ② what
 * this simulator does about each — the draw and the two-phase list are the draft's, the window it
 * never adapts, the fresh draw after a collision and the capture rule are its own; ③ three guided
 * runs. Six ambient-power tags on a ring 2 m from the router — same distance, same level — share
 * four uplink slots every 20 ms. Since 2026-11-11 every AMP TXOP fits the AP's AC_BK TXOP limit,
 * so at 250 kb/s the four slots go out as two triggers of two, in two TXOPs, and a scheduled
 * trigger lists one tag.
 *
 * The scene, its three variants and its five jumps are unchanged, so the recorded timeline hashes
 * did not move; two of the jumps fire only in a variant. Every figure quoted below is read back
 * out of this file and compared with a run in tests/course/amp-slots.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, ampAp, firstAmpLost, firstAmpSatOut, firstCollision, firstScheduledTrigger, oneRoom, sc, tag, txOf, type Lesson } from '../lessonKit'

/** Seven positions on a 2 m ring around the router; the base lab uses the first six. */
const RING = [0, 1, 2, 3, 4, 5, 0.5].map((k) => {
  const a = (k * Math.PI) / 3
  return { x: +(5 + 2 * Math.cos(a)).toFixed(3), y: +(4 + 2 * Math.sin(a)).toFixed(3) }
})

/** The lab: one polling router and `tags` tags evenly spread on the ring. */
export function ampSlotsScenario(o: { acwe: number; readMode: 'inline' | 'twoPhase'; tags?: number }): Scenario {
  return sc(oneRoom(), [
    ampAp('ap', 'Router', 5, 4, { pollIntervalMs: 20, slots: 4, acwe: o.acwe, readMode: o.readMode }),
    ...RING.slice(0, o.tags ?? 6).map((p, i) => tag(`tag-${i + 1}`, `Tag ${i + 1}`, p.x, p.y)),
  ])
}

export const ampSlots: Lesson = {
  id: 'amp-slots',
  module: 10,
  title: '时隙化随机接入：ABOC、ACW 与碰撞',
  why: 'P802.11bp 给自行发射的标签定义了两种基于时隙的接入：随机接入与调度接入。随机接入的触发帧（Trigger frame）给出时隙数 N 和窗口指数 ACWE；标签在 0 到 ACW = 2^ACWE − 1 之间均匀随机取 ABOC，ABOC 小于 N 就在第 ABOC + 1 个时隙作答，否则这一轮不作答。草案还允许分两个阶段：先用随机接入征求身份，再发一帧调度型触发帧，按名单顺序为每个被收到的标签指定一个时隙。接入点（access point, AP）怎样选 ACWE、标签重传（retry）时怎样取 ABOC，草案都没有规定。每次传输机会（TXOP）不得超过 AC_BK 的 TXOP 限制 2.528 ms，所以 250 kb/s 下一轮的四个时隙由两帧触发帧各分配两个，分在两次传输机会里。本仿真器照草案实现抽取规则与两阶段名单；ACWE 在一次运行里固定不变，碰撞之后标签从同一个区间重新抽取，不保留任何状态。由于每次抽取彼此独立，一个时隙空闲、成功或碰撞的概率可以直接用组合算出；三十轮的实测与公式相差不到五个百分点。六个标签争用每帧触发帧的两个时隙时，ACWE = 1 让每个标签每帧都作答，碰撞占可达时隙的 88.3 %；ACWE = 3 让四分之三的抽取落在时隙之外，碰撞最少，送达的读数最多。两阶段的调度阶段没有碰撞，但一帧调度型触发帧连同两个标签的时隙放不进一次传输机会，每帧只能列一个标签；多出的触发帧与 Ack 使总的空口时间（airtime）增加 10.2 %，送达的读数反而少 2 个。',
  outcomes: [
    '按草案说出标签怎样由 ACWE 算出窗口、抽取 ABOC 并换算成时隙',
    '说出两阶段接入的过程，以及草案没有规定的两件事',
    '用组合公式预测空闲、成功与碰撞三种时隙的比例，并与实测比较',
    '根据送达的读数判断 ACWE 应往哪个方向调',
  ],
  needs: ['amp-intro', 'amp-ppdu'],
  terms: [
    { term: 'ACWE', plain: '触发帧里的窗口指数，标签据此算出抽取范围有多宽' },
    { term: 'ACW', plain: '由 ACWE 算出的抽取上限：ACW = 2^ACWE − 1，标签在 0 到 ACW 之间取 ABOC' },
    { term: 'capture effect', plain: '捕获效应（capture effect）：接收机已锁定一路信号时，另一路明显更强的信号使它改锁到后者' },
    { term: 'two-phase', plain: '两阶段接入：先随机接入征求身份，再用调度型触发帧按名单为每个标签指定时隙' },
  ],
  standard: [
    { heading: '依据（11-26/1889r4；11-26/1519r5；11-24/1613r20）', text: 'P802.11bp 仍是草案。本课的规则来自规范框架 11-24/1613r20 已通过的动议，以及两份以 D0.5 为基线的草案文本：11-26/1889r4 的 39.4 节（信道接入）与 11-26/1519r5 的 39.3 节（触发过程）。TGbp 在 2026 年 9 月会议上以意向投票 #90 与 #87 无异议同意把这两份文本并入下一版草案（11-25/1692r50）。' },
    { heading: '两种接入（规范框架 MM-8、MM-9、MM-25；11-26/1889r4 §39.4）', text: '草案为自行发射的终端定义基于时隙的随机接入与调度接入（动议 #50、#51）：随机接入时，终端在触发帧指出的时隙里随机选一个发送（#102）；调度接入时，终端在触发帧分配给它的时隙里发送。39.4 节要求非 AP AMP 站点（station, STA）支持这两种过程。' },
    { heading: '随机接入的触发帧（规范框架 FM-9；11-26/1519r5 §39.3.2.1）', text: '用于随机接入的广播触发帧带有会话号、ACWE 和时隙数 N（动议 #105、#141）。ACW = 2^ACWE − 1，是以时隙为单位的竞争窗口（contention window, CW）上限。时隙数大于 1 时，各时隙等长，由一个时隙长度字段给出。' },
    { heading: '抽取（11-26/1889r4 §39.4；规范框架 MM-45）', text: '准备作答的终端在整数区间 [0, ACW] 里均匀随机取一个新的 ABOC。ABOC 小于 N 时，它可以在第 ABOC + 1 个时隙发送；ABOC 不小于 N 时，它不得为这一帧触发帧发送。时隙从 1 开始编号。重传时怎样取 ABOC，规范框架标为待定（动议 #224）。接入点怎样选 ACWE，草案没有规定。' },
    { heading: '时隙与确认（规范框架 MM-46；11-26/1519r5 §39.3.2.2）', text: '接入点发一帧 AMP Ack 标出第 2 个及以后每个时隙的起点，轮到的终端在这帧 Ack 之后一个短帧间间隔（short interframe space, SIFS）发送（动议 #247）。Ack 的 ID 字段写上一个时隙里收到的终端；在不是最后一个的时隙里什么也没收到，就写接入点自己的标识。' },
    { heading: '两阶段接入（规范框架 MM-26、FM-10、FM-29；11-26/1519r5 §39.3.2.1）', text: '接入点可以先发一帧随机接入的广播触发帧征求终端的标识，再按随机时隙里收到的标识发一帧调度型触发帧（动议 #103）。调度型触发帧的帧体（Frame Body）带一份终端标识名单，名单中的位置按升序对应时隙，第一个标识对应第一个时隙（#107）。随机接入的作答是否带帧体，由触发帧征求的作答内容决定（#184、#231）。' },
    { kind: 'steps', heading: '一次抽取，按草案：逐步说明', items: [
      '终端解出随机接入的触发帧，读出 ACWE 与时隙数 N（§39.3.2.1）。',
      '终端在 [0, 2^ACWE − 1] 里均匀随机取 ABOC（§39.4）。',
      'ABOC < N 时，在第 ABOC + 1 个时隙发送；否则不为这一帧触发帧发送（§39.4）。',
      '每个时隙结束后，接入点发一帧 AMP Ack，写收到的终端或接入点自己，并标出下一个时隙的起点（§39.3.2.2）。',
      '两阶段时，接入点再发一帧调度型触发帧，按名单顺序为随机阶段收到的终端各指定一个时隙（§39.3.2.1）。',
    ] },
    { heading: '草案没有规定的', text: '两个终端选中同一个时隙时，接收机怎样判决；接入点怎样根据碰撞调整 ACWE；终端重传时怎样取 ABOC。' },
  ],
  implementation: [
    { topic: 'ABOC 的抽取', standard: '[0, 2^ACWE − 1] 均匀取 ABOC，ABOC < N 时在第 ABOC + 1 个时隙发送，否则不发送（§39.4）', sim: '照此实现。每个解出触发帧的标签每帧触发帧抽取一次；本课 250 kb/s 下每帧 N = 2。', kind: 'faithful' },
    { topic: '一轮分几次传输机会', standard: '时隙数由接入点在触发帧里给出（§39.3.2.1）；一次传输机会不得超过 TXOP 限制（IEEE Std 802.11-2024 §10.23.2.9）', sim: '场景给出一轮的时隙数（本课 4 个）；每次传输机会发一帧触发帧，取剩下的时隙里放得进 TXOP 限制的最多个数，其余留到下一次 AC_BK 传输机会。本课随机阶段每次 2 个时隙，调度阶段每次 1 个。', kind: 'choice' },
    { topic: '碰撞之后', standard: '重传时怎样取 ABOC，规范框架标为待定（动议 #224）', sim: '标签不记录任何历史：下一帧触发帧到来时，从同一个区间重新抽取，窗口不加倍。', kind: 'choice' },
    { topic: 'ACWE 的选择', standard: '草案没有规定接入点怎样选 ACWE', sim: 'ACWE 是场景参数，一次运行里固定不变；本课的三个取值分别放在三个场景里。引擎不按碰撞率调整它。', kind: 'choice' },
    { topic: '时隙的定时', standard: '第 2 个及以后的时隙在 AMP Ack 之后一个 SIFS（动议 #247）', sim: '标签按收到的 Ack 计数，数到第 ABOC 帧就在其后发送；漏收一帧 Ack 的标签放弃这一轮。', kind: 'faithful' },
    { topic: '两阶段的名单', standard: '名单中的位置按升序对应时隙（§39.3.2.1）', sim: '照此实现：随机阶段按时隙顺序记下收到的标签，调度型触发帧依次列出；随机阶段一个也没收到时，不发调度型触发帧。', kind: 'faithful' },
    { topic: '两阶段的字段宽度', standard: '名单中每个标识的宽度与作答内容的编码，本课依据的文件没有给出', sim: '名单里每个标签 2 个字节；随机阶段只报身份的作答 7 个字节，调度阶段带读数的作答 15 个字节。', kind: 'value' },
    { topic: '两阶段的保护与长度', standard: '一次传输机会（transmit opportunity, TXOP）不得超过 TXOP 限制；接入点用 dot11QAPEDCATable，AC_BK 缺省 2.528 ms（IEEE Std 802.11-2024 §10.23.2.9，表 9-194）', sim: '照此实现：每次传输机会都在 2.528 ms 之内；CTS-to-self（CTS to self）按这一次传输机会实际要发的触发帧、时隙与 Ack 预留。', kind: 'faithful' },
    { topic: '同一时隙里的多路作答', standard: '草案不规定接收机的判决', sim: '后到的一路比已锁定的一路强 5 dB 以上、且落在上行（uplink, UL）48 µs 的 AMP-Sync 之内才改锁；同时到达的几路电平相近时，接收机连前导码（preamble）都捕获不到，全部丢失。', kind: 'value' },
    { topic: '传播', standard: '标准不规定信道模型', sim: '传播模型确定，不含快衰落：六个标签到达路由器的电平彼此相差不到 0.01 dB，同一时隙里的几路作答永远分不出强弱。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '第一轮，逐时隙',
      jump: 0,
      steps: [
        '载入本课场景，跳到时隙里的第一次碰撞。',
        '对照下表读出第一轮每个时隙里是谁、结果如何，再看路由器在碰撞的时隙之后发出的 Ack 写的是谁。',
      ],
      blocks: [
        { kind: 'table', heading: '第一轮的四个时隙', head: ['传输机会', '时隙', '开始', '抽到它的标签', '结果'], rows: [
          ['1', '1', '688 µs', 'Tag 2（ABOC 0）', '1556 µs 被确认'],
          ['1', '2', '1566 µs', 'Tag 1（ABOC 1）', '2434 µs 被确认'],
          ['2', '1', '3240 µs', 'Tag 1、5（都是 ABOC 0）', '碰撞；Ack 写的是路由器自己'],
          ['2', '2', '4118 µs', '无人', 'Ack 写的是路由器自己'],
        ] },
      ],
      expect: '两个标签在 3240 µs 同时开始发送，路由器记下两条原因为 preambleSinr 的 RX_MISS、没有 RX_FAIL，并在时隙结束的 3768 µs 记下一条 COLLISION；3778 µs 那帧 Ack 写的是路由器自己，两个标签在 4108 µs 收到它。三十轮、60 次传输机会里 120 帧 Ack 中 42 帧写的是某个标签，78 帧写的是路由器自己。',
      meaning: '抽取与 Ack 的写法照草案（①）；几路电平相同的作答全部丢失，是本仿真器的判决取法与确定的传播模型共同造成的（②）。',
    },
    {
      heading: '窗口的宽窄',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「ACWE 1（ACW 1）」与「ACWE 3（ACW 7）」，各运行三十轮（600 ms）。',
        '对照下表比较公式与实测，并读出每轮送达的读数。',
      ],
      blocks: [
        { kind: 'formula', heading: '只按草案的抽取规则推算', text: 'q = 1/(ACW + 1)        可达时隙 = min(N, ACW + 1)\nP(空闲) = (1 − q)^M     P(成功) = M·q·(1 − q)^(M−1)     P(碰撞) = 1 − P(空闲) − P(成功)', note: 'M 个标签各自独立、均匀地抽取，这正是 §39.4 的规则；q 是一个标签落在某个可达时隙的概率。比例只按可达时隙计算。' },
        { kind: 'table', heading: '公式 / 三十轮实测（M = 6，每帧 N = 2）', head: ['ACWE', '可达时隙', '空闲', '成功', '碰撞', '每轮送达'], rows: [
          ['1（ACW 1）', '2 / 2', '1.6 % / 0.8 %', '9.4 % / 10.8 %', '89.1 % / 88.3 %', '0.43'],
          ['2（ACW 3）', '2 / 2', '17.8 % / 19.2 %', '35.6 % / 35.0 %', '46.6 % / 45.8 %', '1.40'],
          ['3（ACW 7）', '2 / 2', '44.9 % / 40.0 %', '38.5 % / 41.7 %', '16.7 % / 18.3 %', '1.67'],
        ] },
      ],
      expect: '九个比例里实测与公式最大相差 4.88 个百分点（ACWE 3 的空闲一列）。ACWE 1 下有一个标签一次也没被确认；ACWE 3 下 360 次抽取中 263 次落在时隙之外，占 73.1 %，公式给的是四分之三。',
      meaning: '抽取独立而均匀（①），所以组合公式不必像分布式协调功能（distributed coordination function, DCF）的模型那样自洽求解；ACWE 怎么选是接入点的事，草案不管（①），本仿真器也不自动调整（②）。',
    },
    {
      heading: '两阶段：先报身份，再送读数',
      variant: 2,
      jump: 4,
      steps: [
        '载入「两阶段：先报身份，再送读数」，跳到第一帧调度型触发帧，读出它列出的标签。',
        '对照下式读出第一轮两个阶段的长度，再比较三十轮的读数与空口时间。',
      ],
      blocks: [
        { kind: 'formula', heading: '第一轮的两个阶段，每次传输机会', text: '随机阶段 = 50 + 10 + 618 + 2 × (10 + 272 + 10 + 330) = 1922 µs\n调度阶段 = 50 + 10 + 682 + 1 × (10 + 528 + 10 + 330) = 1620 µs', note: '随机阶段的作答只报身份，时隙 272 µs；调度阶段的作答带读数，时隙 528 µs。名单列两个标签时，调度阶段一次要 2562 µs，超过 2528 µs。' },
      ],
      expect: '第一轮的随机阶段用两次传输机会，收到 Tag 2 和 Tag 1；调度阶段按这个顺序发两帧调度型触发帧，每帧列一个标签，长 15 个字节、682 µs。CTS-to-self 在随机阶段预留 1872 µs，在调度阶段预留 1570 µs。三十轮里两阶段送达 40 个读数，内联方式送达 42 个；空口时间内联方式 174 242 µs，两阶段 192 018 µs，多 10.2 %。',
      meaning: '名单与时隙的对应照草案（①）；名单里每个标识 2 个字节、每次传输机会放几个时隙，是本仿真器的取值与取法（②）。',
    },
  ],
  sources: [
    'IEEE P802.11bp 草案（以 D0.5 为基线）：规范框架 11-24/1613r20 的 MM-8（动议 #50）、MM-9（#51）、MM-25（#102）、MM-26（#103）、MM-45（#224）、MM-46（#227、#247）、FM-9（#105、#141）、FM-10（#107）、FM-29（#184、#231）；草案文本 11-26/1889r4 的 39.4 节与 11-26/1519r5 的 39.3.2.1、39.3.2.2 节；通过记录见 11-25/1692r50（#87、#90）。',
    'IEEE Std 802.11-2024 §10.23.2.9 与表 9-194（TXOP 限制，AC_BK 缺省 2.528 ms）；附录 C 的 dot11QAPEDCATable（接入点的 EDCA 参数）。',
    '本仿真器的取值与取法：固定不变的 ACWE、碰撞之后从同一区间重新抽取、一轮按 TXOP 限制分成几次传输机会、名单里每个标签 2 个字节、7 个字节的身份作答、每次传输机会前的 CTS-to-self、5 dB 的改锁门限（借自 ns-3 的缺省值）、不含快衰落的传播模型。',
  ],
  limits: [],
  scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'inline' }),
  variants: [
    { label: 'ACWE 1（ACW 1）', scenario: () => ampSlotsScenario({ acwe: 1, readMode: 'inline' }) },
    { label: 'ACWE 3（ACW 7）', scenario: () => ampSlotsScenario({ acwe: 3, readMode: 'inline' }) },
    { label: '两阶段：先报身份，再送读数', scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'twoPhase' }) },
  ],
  jumps: [
    J('时隙里的第一次碰撞', firstCollision),
    J('第一帧标明路由器自己的 Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
    J('第一次回应丢失', firstAmpLost),
    J('第一次轮空（ACWE 3 变体）', firstAmpSatOut),
    J('第一帧调度型触发帧（两阶段变体）', firstScheduledTrigger),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '假如一帧触发帧给出四个时隙而 ACWE = 1，为什么时隙 3 和 4 始终为空？',
      options: [
        '路由器收到足够多的作答后提前结束这一轮',
        'ACW = 1，ABOC 只能是 0 或 1，按 §39.4 只可能落在时隙 1 或 2',
        '标签距离太远，靠后的时隙里收不到它们',
      ],
      answer: 1,
      explain: 'ABOC 在 [0, ACW] 里抽取，待发时隙是 ABOC + 1；ACW = 1 时只有时隙 1 和 2 可达。',
    },
    {
      q: '一个标签的作答与别人碰撞了。按草案，它下一轮怎样取 ABOC？',
      options: [
        '窗口加倍，再在新窗口里抽取',
        '草案没有规定重传时怎样取 ABOC；本仿真器让它从同一个区间重新抽取',
        '沿用上一轮的 ABOC',
      ],
      answer: 1,
      explain: '规范框架的 MM-45（动议 #224）把重传时的取法标为待定；从同一区间重新抽取是本仿真器的取法。',
    },
    {
      q: '为什么这里的组合公式可以直接与实测比较，而 DCF 的模型要自洽求解？',
      options: [
        '因为标签更少',
        '因为每个标签的抽取范围由触发帧给出、彼此独立，不随碰撞历史改变',
        '因为碰撞之后路由器替标签重传',
      ],
      answer: 1,
      explain: 'DCF 里站点在一个时隙发送的可能性取决于随碰撞加倍的竞争窗口，必须求解；这里的抽取范围每轮由触发帧给出，落在每个时隙的可能性是已知量。',
    },
  ],
}
