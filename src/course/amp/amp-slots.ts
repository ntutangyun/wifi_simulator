/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · Slotted random access.
 *
 * Six ambient-power tags on a ring 2 m from the router — same distance, same
 * RSSI, so no collision is ever resolved by capture — share four uplink slots
 * every 20 ms. ABOC, ACW, sit-outs, collisions, and a small analytic model of
 * the slot checked against thirty measured rounds. Every number quoted below is
 * pinned in tests/course/amp-slots.test.ts.
 *
 * CAUTION — this lesson sits close to the minute at which `lessonMinutes` rounds
 * up from 25 to 30. Adding a section means checking the estimate again
 * (`npx tsx scripts/lesson-dump.ts amp-slots`), or the study-time test fails.
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
  body: [
    { text: 'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课拆解的上行接入来自提案草案文本 11-26/1889r4 第 39.4 节，触发过程见 11-26/1519r5。最初那一课里每个标签都有自己的时隙，根本不必问“时隙该给谁”。这一课要问的是更难的问题：当想要时隙的标签比时隙还多时，会发生什么？' },
    { heading: '场景：六个标签，四个时隙', text: '六个标签均匀分布在距路由器 2 m 的圆环上。这个几何布置是刻意的：每个标签收到路由器的下行都是 −30.7 dBm，到达 AP 的上行都是 −50.7 dBm——下行余量 41.3 dB，上行余量 43.3 dB——六者之间的差异不到百分之一分贝。捕获要求某一路信号比其他路高出 5 dB，而且必须落在上行回应仅有的那 48 µs AMP-Sync 之内。这里谁都没有这个余量，所以碰撞永远就是碰撞。' },
    { text: '路由器把轮询间隔从 100 ms 收紧到 20 ms，于是三十轮正好装进 600 ms——下文每个数字都是在这个窗口里量出来的。轮本身与最初那一课相同：50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs。变的是它的代价：占每 20 ms 的 20.95 %，而不是每 100 ms 的 4.19 %。' },
    { heading: 'ABOC 与 ACW', text: '标签没有载波侦听，它唯一能做的决定就是“在第几个时隙回应”。触发帧里带着 AMP 竞争窗口指数 ACWE，标签据此算出 ACW = 2^ACWE − 1，在 0 到 ACW 之间均匀抽取一个 AMP 退避计数器（ABOC），然后在第 ABOC + 1 个时隙发送。若抽到的数超出了本轮提供的时隙数，它就空转这一轮，什么也不发（11-26/1889r4 §39.4）。' },
    { kind: 'formula', text: 'ACW = 2^ACWE − 1     slot = ABOC + 1（当 ABOC < N），否则空转', note: 'ACWE 1 → ACW 1，ACWE 2 → ACW 3，ACWE 3 → ACW 7。基础场景用 ACWE 2、N = 4 个时隙，因此每次抽取都能落到一个真实时隙上。六个标签每轮都能解出触发帧，所以每轮开头都有六次抽取——三十轮共 180 次。' },
    { text: '协议就这么多。碰撞之后没有窗口翻倍，没有重传计数器，没有任何历史状态：下一帧触发帧到来时，从同一个区间重新抽一次。标签甚至分不清“撞了”还是“信号弱”——它看到的只是一帧没有点自己名字的 Ack。' },
    { kind: 'table', heading: '第一轮，逐时隙展开', head: [
      '时隙', '开始', '谁抽到了它', '结果',
    ], rows: [
      ['1', '688 µs', 'Tag 2（ABOC 0）', '1556 µs 被确认'],
      ['2', '1566 µs', 'Tag 1（ABOC 1）', '2434 µs 被确认'],
      ['3', '2444 µs', 'Tag 3、5、6（都是 ABOC 2）', '碰撞；Ack 点名的是路由器自己'],
      ['4', '3322 µs', 'Tag 4（ABOC 3）', '4190 µs 被确认'],
    ] },
    { text: '三个标签都抽到了 2，于是在 2444 µs 同时开始发送。它们到达 AP 的功率彼此相差不到百分之一分贝，因此连前导都没能被捕获：AP 记录下三条原因为 preambleSinr 的 RX_MISS——一条 RX_FAIL 都没有——以及 2972 µs（时隙关闭那一瞬）的一条 COLLISION。整个运行过程中，任何节点上都没有出现原因为 capture 的 RX_FAIL。' },
    { text: '2982 µs 那帧 Ack 和平常一样是 330 µs 的 PPDU，但它的 ID 字段里装的是路由器自己的标识。三个标签都在 3312 µs 读到它，把这一轮记为丢失。三十轮下来，120 帧 Ack 里 46 帧点名了某个标签，74 帧写的是路由器自己。' },
    { heading: '一个小号的 Bianchi 模型', text: '第二模块里我们搭过 DCF 的 Bianchi 模型：先求出终端的发送概率，再推出某个时隙空闲、成功或碰撞的概率。时隙化的 AMP 接入是同一个思路，只是把最难的部分拿掉了。没有退避冻结、没有窗口翻倍、没有碰撞历史，因此不需要任何自洽求解——发送概率由触发帧直接交给标签，剩下的就是组合计算。' },
    { kind: 'formula', text: 'q = 1/(ACW + 1)        p = min(N, ACW + 1)/(ACW + 1)\nP(空) = (1 − q)^M     P(成功) = M·q·(1 − q)^(M−1)     P(碰撞) = 1 − P(空) − P(成功)', note: 'q 是单个标签落进某个“可达时隙”的概率；p 是它这一轮究竟会不会发送的概率，于是 1 − p 就是空转率。只有前 min(N, ACW + 1) 个时隙可达——再往后的时隙从构造上就必然为空，不计入下表比例。' },
    { kind: 'table', heading: '模型 / 三十轮实测（M = 6，N = 4）', head: [
      'ACWE', '可达时隙',
      '空', '成功', '碰撞',
    ], rows: [
      ['1 (ACW 1)', '2 of 4', '1.6 % / 0.0 %', '9.4 % / 11.7 %', '89.1 % / 88.3 %'],
      ['2 (ACW 3)', '4 of 4', '17.8 % / 16.7 %', '35.6 % / 38.3 %', '46.6 % / 45.0 %'],
      ['3 (ACW 7)', '4 of 4', '44.9 % / 42.5 %', '38.5 % / 43.3 %', '16.7 % / 14.2 %'],
    ] },
    { text: '每行只有 120 个时隙，实测比例与公式的偏差却都不超过 0.05，也就是五个百分点；全表最大的一处偏差是 ACWE 3 的“成功”一列，4.87 个百分点（四舍五入后的表格单元格相差 4.8）。空转率也对得上：1 − p 预言 ACWE 3 下有一半抽取会空转，实测 180 次中空转 91 次，50.6 %。ACWE 1 与 2 下公式给出 p = 1，实测也确实一次空转都没有。' },
    { heading: '怎么选 ACW', text: 'ACW 太小，标签挤成一团；ACW 太大，它们被撒到时隙列表之外。ACWE 1 是病态的那一端：ACW + 1 = 2 小于本轮提供的四个时隙，于是时隙 3、4 从构造上就不可达。60 个这样的时隙全是空的，它们占用的 1756 µs——整轮的 41.9 %——每轮都白白付出。可达时隙里 88.3 % 以碰撞收场，整整 600 ms 只送达 7 个读数（每轮 0.23 个），六个标签里有两个一次都没被确认过。' },
    { text: 'ACWE 3 是另一端，友善得多：一半的抽取选择空转，三十轮里只有 17 次碰撞，送达 52 个读数——每轮 1.73 个。空转和碰撞不是一回事：沉默的标签不占空口时间，损失的只是自己这一轮。ACWE 2 落在中间，46 个读数、每轮 1.53 个，最吃亏的标签送出 4 个，而 ACWE 3 下是 6 个。六个标签抢四个时隙时，AP 应该把 ACWE 调高——这正是这个值为什么写在触发帧里、每轮重新广播，而不是固化在标签里。' },
    { heading: '为什么 Ack 就是标签的时钟', text: 'AMP Ack 并不携带标签可以依赖的时隙序号（SFD 11-24/1613r20 MM-46、PDT 39.4）：标签按到达顺序数 Ack，数到第 slot − 1 帧就开始发送。于是“漏掉一帧 Ack”不只是漏掉一帧 Ack，而是丢掉一整轮——标签少数一帧，晚一个时隙才发送，而 AP 只接收当前时隙里的回应，直接忽略它。本场景里这从未发生：余量高达几十分贝，180 次回应全部落在抽取所指定的时隙里。这就是“把时隙锚在 Ack 上、而不是锚在标签根本没有的时钟上”所要付的代价。' },
    { heading: '两阶段：竞争用便宜的，读数用贵的', text: '两阶段变体把这两件事分开做。随机阶段只问身份，回应是 7 个字节而不是 15 个，时隙是 272 µs 而不是 528 µs。被听到的标签随后由第二帧“调度型”触发帧点名，并在名单位置决定的时隙里送出读数——不抽签，也就不可能碰撞。第一轮里随机阶段听到了 Tag 2、Tag 1 和 Tag 4，调度触发帧按这个顺序列出它们：19 个字节、810 µs，比广播触发帧长六个字节，因为名单里每个标签都要占 2 个字节的 ID（这个宽度和 6 字节的触发帧帧体都是模型取值，而非草案值）。' },
    { kind: 'formula', text: '随机阶段 = 50 + 10 + 618 + 4 × (10 + 272 + 10 + 330) = 3166 µs\n调度阶段 =      10 + 810 + 3 × (10 + 528 + 10 + 330) = 3454 µs   →  6620 µs', note: '内联模式下同样的三个读数只花了 4190 µs，两阶段多花 2430 µs。它的 CTS-to-self 要预留 7512 µs——按“四个标签全被听到”的最坏情况计算；三十轮里有 4 轮一个标签也没听到，也就没有调度阶段。' },
    { text: '三十轮下来两种模式送达的读数一样多，都是 46 个：内联花了 154 730 µs 的 PPDU，两阶段花了 167 130 µs，多 8.0 %。便宜的竞争时隙确实省钱，但在这样的帧长下，多出来的一帧触发帧和每个标签多出来的一帧 Ack 更贵。两阶段划算的场合，是读数本身很长的时候。' },
    { kind: 'list', heading: '在哪里看', items: [
      '日志里：“ABOC 1 of [0, 3] → slot 2”、“ABOC 5 of [0, 7] → sits out”、“slot 3: not acknowledged”。',
      '触发帧 6 个字节的帧体：“Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”，两阶段下则是“…… 4 slots × 272 µs · id only”。',
    ] },
  ],
  scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'inline' }),
  variants: [
    { label: 'ACWE 1（ACW 1）', scenario: () => ampSlotsScenario({ acwe: 1, readMode: 'inline' }) },
    { label: 'ACWE 3（ACW 7）', scenario: () => ampSlotsScenario({ acwe: 3, readMode: 'inline' }) },
    { label: '两阶段：先报身份，再送读数', scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'twoPhase' }) },
  ],
  jumps: [
    J('时隙里的第一次碰撞', firstCollision),
    J('第一帧点名路由器自己的 Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
    J('第一次回应丢失', firstAmpLost),
    J('第一次空转（ACWE 3 变体）', firstAmpSatOut),
    J('第一帧调度型触发帧（两阶段变体）', firstScheduledTrigger),
  ],
  observe: [
    '跳到时隙里的第一次碰撞：三帧回应在 2444 µs 一起开始、在 2972 µs 结束，COLLISION 就落在那里。打开 2982 µs 那帧 Ack——它的 ID 字段装的是路由器。再看 AP 记下了什么：三条 RX_MISS，一条 RX_FAIL 也没有，因为功率相等时根本没有前导被捕获。',
    '选中 Tag 3，单步走过五轮。它的 ABOC 每轮都在变，完全不记得上一轮发生了什么；三十轮里四个取值它都抽到过。标签状态里没有“碰撞后会翻倍的竞争窗口”：取值范围来自触发帧，每轮一模一样。',
    '载入 ACWE 3 变体，跳到 678 µs 的第一次空转：Tag 3 从 [0, 7] 抽到 5，整轮一声不吭。42.5 % 的时隙是空的——碰撞率降到 14.2 %，买单的正是这些空时隙。',
  ],
  tryThis: [
    '依次载入 ACWE 1 与 ACWE 3 两个变体，或在编辑器的 AMP 轮询设置里自己改 ACWE，看送达的读数如何变化：ACWE 1 每轮 0.23 个，ACWE 2 每轮 1.53 个，ACWE 3 每轮 1.73 个。ACWE 1 下时隙 3 和 4 里永远什么都没有。然后用公式推一推：如果只有两个标签而不是六个，你会选哪个 ACWE？',
    '用编辑器在同样 2 m 的距离上再加第七个标签，然后重新载入。送达率从每轮 1.53 个读数掉到 1.03 个，碰撞时隙占比从 45.0 % 升到 59.2 %——模型预测 55.5 %。',
  ],
  quiz: [
    {
      q: 'ACWE 1、本轮提供四个时隙时，为什么时隙 3 和 4 里永远什么都没有？',
      options: [
        'AP 听够了标签就提前结束这一轮',
        'ACW + 1 = 2，抽到的只能是 0 或 1，因此只可能指向时隙 1 或 2',
        '标签太远了，靠后的时隙里听不见它们',
      ],
      answer: 1,
      explain: 'ABOC 是从 0 到 ACW = 1 之间抽的，待发时隙只可能是 1 或 2。那两个够不着的时隙照样要花 1756 µs，占每轮的 41.9 %。',
    },
    {
      q: '三个标签在同一个时隙里发送，到达功率也相同。AP 会记录下什么？',
      options: [
        '什么也没解出：三条 RX_MISS 加一条 COLLISION，收尾的 Ack 点名路由器',
        '一条原因为 capture 的 RX_FAIL——它锁定了三者中最强的一路',
        '收下第一帧回应，另外两帧当作重复丢弃',
      ],
      answer: 0,
      explain: '捕获要求某一路比其他路高出 5 dB，而且要落在上行回应仅有的那 48 µs AMP-Sync 之内。等半径圆环上谁都没有这个余量，于是没有前导被捕获，整个运行里也不会出现原因为 capture 的 RX_FAIL。',
    },
    {
      q: 'Bianchi 的 DCF 模型必须自洽求解 τ。为什么 AMP 的时隙模型可以直接拿去和实测比对？',
      options: [
        '因为终端数更少，近似更准',
        '因为标签的取值范围来自触发帧，从不依赖碰撞历史，所以 q = 1/(ACW + 1) 事先就知道',
        '因为碰撞之后 AP 会代替标签重传',
      ],
      answer: 1,
      explain: 'Bianchi 必须求解 τ，因为终端的窗口会随碰撞次数翻倍。AMP 标签没有窗口翻倍、没有冻结、没有历史：触发帧每轮都重新广播 ACW，于是发送概率是已知输入，而不是待解的未知数。',
    },
  ],
}
