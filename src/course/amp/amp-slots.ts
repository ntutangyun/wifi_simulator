/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · Slotted random access.
 *
 * Six ambient-power tags on a ring 2 m from the router — same distance, same
 * RSSI, so no collision is ever resolved by capture — share four uplink slots
 * every 20 ms. ABOC, ACW, sit-outs, collisions, and a small analytic model of
 * the slot checked against thirty measured rounds. Every number quoted below is
 * pinned in tests/course/amp-slots.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, ampAp, firstAmpLost, firstAmpSatOut, firstCollision, firstScheduledTrigger, oneRoom, sc, tag, txOf,
  type Lesson,
} from '../lessonKit'

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
  module: 7,
  title: { en: 'Slotted random access: ABOC, ACW and collisions', zh: '时隙化随机接入：ABOC、ACW 与碰撞' },
  body: [
    { text: {
      en: 'IEEE P802.11bp is still a draft: D0.5 in May 2026, D1.0 to letter ballot in September 2026. The uplink access taken apart here is proposed draft text 11-26/1889r4 §39.4, the triggering procedure 11-26/1519r5. Lesson 1 gave each tag a slot of its own. This lesson asks what happens when more tags want a slot than there are slots.',
      zh: 'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课拆解的上行接入来自提案草案文本 11-26/1889r4 第 39.4 节，触发过程见 11-26/1519r5。第一课里每个标签都有自己的时隙，根本不必问“时隙该给谁”。这一课要问的是更难的问题：当想要时隙的标签比时隙还多时，会发生什么？',
    } },
    { heading: { en: 'The scene: six tags, four slots', zh: '场景：六个标签，四个时隙' }, text: {
      en: 'Six tags sit on a ring 2 m from the router. The geometry is deliberate: every one hears the router at −37.2 dBm and reaches it at −57.2 dBm — 34.8 dB of downlink margin, 36.8 dB up — with under a hundredth of a decibel between them. Capture needs one signal 5 dB above the rest, inside the 48 µs of AMP-Sync that is an uplink response’s whole preamble. Nothing here has it, so a collision is always a collision.',
      zh: '六个标签均匀分布在距路由器 2 m 的圆环上。这个几何布置是刻意的：每个标签收到路由器的下行都是 −37.2 dBm，到达 AP 的上行都是 −57.2 dBm——下行余量 34.8 dB，上行余量 36.8 dB——六者之间的差异不到百分之一分贝。捕获要求某一路信号比其他路高出 5 dB，而且必须落在上行回应仅有的那 48 µs AMP-Sync 之内。这里谁都没有这个余量，所以碰撞永远就是碰撞。',
    } },
    { text: {
      en: 'The router polls every 20 ms, so thirty rounds fit into 600 ms — the window every number below is measured over. The round itself is unchanged from lesson 1: 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs. Its price is not: 20.95 % of every 20 ms instead of 4.19 % of every 100 ms.',
      zh: '路由器把轮询间隔从 100 ms 收紧到 20 ms，于是三十轮正好装进 600 ms——下文每个数字都是在这个窗口里量出来的。轮本身与第一课相同：50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs。变的是它的代价：占每 20 ms 的 20.95 %，而不是每 100 ms 的 4.19 %。',
    } },
    { heading: { en: 'ABOC and ACW', zh: 'ABOC 与 ACW' }, text: {
      en: 'A tag has no carrier sense, so its only decision is which slot to answer in. The trigger carries an AMP contention window exponent, ACWE; the tag computes ACW = 2^ACWE − 1, draws an AMP backoff counter (ABOC) uniformly from 0 to ACW, and transmits in slot ABOC + 1. If the draw is too big for the slots on offer it sits the round out (11-26/1889r4 §39.4).',
      zh: '标签没有载波侦听，它唯一能做的决定就是“在第几个时隙回应”。触发帧里带着 AMP 竞争窗口指数 ACWE，标签据此算出 ACW = 2^ACWE − 1，在 0 到 ACW 之间均匀抽取一个 AMP 退避计数器（ABOC），然后在第 ABOC + 1 个时隙发送。若抽到的数超出了本轮提供的时隙数，它就空转这一轮，什么也不发（11-26/1889r4 §39.4）。',
    } },
    { kind: 'formula', text: {
      en: 'ACW = 2^ACWE − 1     slot = ABOC + 1 if ABOC < N, otherwise sit out',
      zh: 'ACW = 2^ACWE − 1     slot = ABOC + 1（当 ABOC < N），否则空转',
    }, note: {
      en: 'ACWE 1 → ACW 1, ACWE 2 → ACW 3, ACWE 3 → ACW 7. The base scenario uses ACWE 2 with N = 4, so every draw reaches a slot. All six tags decode every trigger: six draws a round, 180 in the thirty measured here.',
      zh: 'ACWE 1 → ACW 1，ACWE 2 → ACW 3，ACWE 3 → ACW 7。基础场景用 ACWE 2、N = 4 个时隙，因此每次抽取都能落到一个真实时隙上。六个标签每轮都能解出触发帧，所以每轮开头都有六次抽取——三十轮共 180 次。',
    } },
    { text: {
      en: 'That is the whole protocol. No window doubling, no retry counter, no history: the next trigger brings a fresh draw from the same range. A tag cannot even tell a collision from a weak link — it only sees an Ack that does not name it.',
      zh: '协议就这么多。碰撞之后没有窗口翻倍，没有重传计数器，没有任何历史状态：下一帧触发帧到来时，从同一个区间重新抽一次。标签甚至分不清“撞了”还是“信号弱”——它看到的只是一帧没有点自己名字的 Ack。',
    } },
    { kind: 'table', heading: { en: 'The first round, slot by slot', zh: '第一轮，逐时隙展开' }, head: [
      { en: 'Slot', zh: '时隙' }, { en: 'Opens', zh: '开始' }, { en: 'Who drew it', zh: '谁抽到了它' }, { en: 'Outcome', zh: '结果' },
    ], rows: [
      [N('1'), N('688 µs'), { en: 'Tag 2 (ABOC 0)', zh: 'Tag 2（ABOC 0）' }, { en: 'acknowledged at 1556 µs', zh: '1556 µs 被确认' }],
      [N('2'), N('1566 µs'), { en: 'Tag 1 (ABOC 1)', zh: 'Tag 1（ABOC 1）' }, { en: 'acknowledged at 2434 µs', zh: '2434 µs 被确认' }],
      [N('3'), N('2444 µs'), { en: 'Tags 3, 5 and 6 (ABOC 2)', zh: 'Tag 3、5、6（都是 ABOC 2）' }, { en: 'collision; the Ack names the router', zh: '碰撞；Ack 点名的是路由器自己' }],
      [N('4'), N('3322 µs'), { en: 'Tag 4 (ABOC 3)', zh: 'Tag 4（ABOC 3）' }, { en: 'acknowledged at 4190 µs', zh: '4190 µs 被确认' }],
    ] },
    { text: {
      en: 'Three tags drew 2 and all three start at 2444 µs. Their signals arrive within a hundredth of a decibel of each other, so nothing is acquired as a preamble at all: the AP records three RX_MISS with reason preambleSinr — not one RX_FAIL — and one COLLISION at 2972 µs, as the slot closes. No node records an RX_FAIL with reason capture in the whole run.',
      zh: '三个标签都抽到了 2，于是在 2444 µs 同时开始发送。它们到达 AP 的功率彼此相差不到百分之一分贝，因此连前导都没能被捕获：AP 记录下三条原因为 preambleSinr 的 RX_MISS——一条 RX_FAIL 都没有——以及 2972 µs（时隙关闭那一瞬）的一条 COLLISION。整个运行过程中，任何节点上都没有出现原因为 capture 的 RX_FAIL。',
    } },
    { text: {
      en: 'The Ack at 2982 µs is the usual 330 µs PPDU, but its ID field carries the router’s own identifier. The three tags read it at 3312 µs and book the round as lost. Over the thirty rounds, 46 of the 120 Acks name a tag and 74 name the router.',
      zh: '2982 µs 那帧 Ack 和平常一样是 330 µs 的 PPDU，但它的 ID 字段里装的是路由器自己的标识。三个标签都在 3312 µs 读到它，把这一轮记为丢失。三十轮下来，120 帧 Ack 里 46 帧点名了某个标签，74 帧写的是路由器自己。',
    } },
    { heading: { en: 'A small Bianchi', zh: '一个小号的 Bianchi 模型' }, text: {
      en: 'Module 2 built Bianchi’s model of DCF: a station’s transmission probability, and from it the chance a slot is idle, successful or collided. Slotted AMP access is the same idea without the hard part: nothing has to be solved self-consistently, because the trigger hands the tag its transmission probability and the rest is combinatorics.',
      zh: '第二模块里我们搭过 DCF 的 Bianchi 模型：先求出终端的发送概率，再推出某个时隙空闲、成功或碰撞的概率。时隙化的 AMP 接入是同一个思路，只是把最难的部分拿掉了。没有退避冻结、没有窗口翻倍、没有碰撞历史，因此不需要任何自洽求解——发送概率由触发帧直接交给标签，剩下的就是组合计算。',
    } },
    { kind: 'formula', text: {
      en: 'q = 1/(ACW + 1)        p = min(N, ACW + 1)/(ACW + 1)\nP(empty) = (1 − q)^M     P(success) = M·q·(1 − q)^(M−1)     P(collision) = 1 − P(empty) − P(success)',
      zh: 'q = 1/(ACW + 1)        p = min(N, ACW + 1)/(ACW + 1)\nP(空) = (1 − q)^M     P(成功) = M·q·(1 − q)^(M−1)     P(碰撞) = 1 − P(空) − P(成功)',
    }, note: {
      en: 'q is the chance one tag lands in a given reachable slot; p is the chance it transmits at all, so 1 − p is its sit-out rate. Only the first min(N, ACW + 1) slots are reachable — anything past that is empty by construction and is left out of the fractions below.',
      zh: 'q 是单个标签落进某个“可达时隙”的概率；p 是它这一轮究竟会不会发送的概率，于是 1 − p 就是空转率。只有前 min(N, ACW + 1) 个时隙可达——再往后的时隙从构造上就必然为空，不计入下表比例。',
    } },
    { kind: 'table', heading: { en: 'Model / measured over thirty rounds (M = 6, N = 4)', zh: '模型 / 三十轮实测（M = 6，N = 4）' }, head: [
      { en: 'ACWE', zh: 'ACWE' }, { en: 'Reachable', zh: '可达时隙' },
      { en: 'Empty', zh: '空' }, { en: 'Success', zh: '成功' }, { en: 'Collision', zh: '碰撞' },
    ], rows: [
      [N('1 (ACW 1)'), N('2 of 4'), N('1.6 % / 0.0 %'), N('9.4 % / 11.7 %'), N('89.1 % / 88.3 %')],
      [N('2 (ACW 3)'), N('4 of 4'), N('17.8 % / 16.7 %'), N('35.6 % / 38.3 %'), N('46.6 % / 45.0 %')],
      [N('3 (ACW 7)'), N('4 of 4'), N('44.9 % / 42.5 %'), N('38.5 % / 43.3 %'), N('16.7 % / 14.2 %')],
    ] },
    { text: {
      en: 'Over only 120 slots a row, no measured fraction is further than 0.05 — five percentage points — from the formula; the largest gap is 4.9 points, on success at ACWE 3. The sit-out rate matches too: 1 − p predicts half the draws sit out at ACWE 3, and 91 of the 180 do, 50.6 %. At ACWE 1 and 2, p = 1 and no tag sits out once.',
      zh: '每行只有 120 个时隙，实测比例与公式的偏差却都不超过 0.05，也就是五个百分点；全表最大的一处偏差是 ACWE 3 的“成功”一列，4.9 个百分点。空转率也对得上：1 − p 预言 ACWE 3 下有一半抽取会空转，实测 180 次中空转 91 次，50.6 %。ACWE 1 与 2 下公式给出 p = 1，实测也确实一次空转都没有。',
    } },
    { heading: { en: 'Choosing ACW', zh: '怎么选 ACW' }, text: {
      en: 'A small ACW crowds the tags together; a large one scatters them past the end of the slot list. ACWE 1 is the pathological end: ACW + 1 = 2 is smaller than the four slots on offer, so slots 3 and 4 are unreachable by construction. All 60 of them are empty, and the 1756 µs they cost — 41.9 % of the round — is paid for nothing. Of the reachable slots 88.3 % end in a collision, only 7 readings arrive in the 600 ms (0.23 a round), and two of the six tags are never acknowledged once.',
      zh: 'ACW 太小，标签挤成一团；ACW 太大，它们被撒到时隙列表之外。ACWE 1 是病态的那一端：ACW + 1 = 2 小于本轮提供的四个时隙，于是时隙 3、4 从构造上就不可达。60 个这样的时隙全是空的，它们占用的 1756 µs——整轮的 41.9 %——每轮都白白付出。可达时隙里 88.3 % 以碰撞收场，整整 600 ms 只送达 7 个读数（每轮 0.23 个），六个标签里有两个一次都没被确认过。',
    } },
    { text: {
      en: 'ACWE 3 is the other end and much kinder: half the draws sit out, only 17 collisions in thirty rounds, and 52 readings — 1.73 a round. Sitting out is not waste the way a collision is; a silent tag costs no airtime and loses only its own turn. ACWE 2 lands between them at 46 readings, 1.53 a round, its thinnest tag getting 4 through against 6 at ACWE 3. With six tags and four slots the AP should raise ACWE — which is why the value rides in the trigger, re-announced every round.',
      zh: 'ACWE 3 是另一端，友善得多：一半的抽取选择空转，三十轮里只有 17 次碰撞，送达 52 个读数——每轮 1.73 个。空转和碰撞不是一回事：沉默的标签不占空口时间，损失的只是自己这一轮。ACWE 2 落在中间，46 个读数、每轮 1.53 个，最吃亏的标签送出 4 个，而 ACWE 3 下是 6 个。六个标签抢四个时隙时，AP 应该把 ACWE 调高——这正是这个值为什么写在触发帧里、每轮重新广播，而不是固化在标签里。',
    } },
    { heading: { en: 'Why the Ack is the tag’s clock', zh: '为什么 Ack 就是标签的时钟' }, text: {
      en: 'The AMP Ack carries no slot index a tag can key on (SFD MM-46, PDT 39.4): the tag counts Acks and transmits once it has seen slot − 1 of them. A missed Ack is therefore a lost round — the tag counts one short, transmits a slot late, and the AP, which accepts a response only in the slot it is running, ignores it. Here that never happens: all 180 responses go out in the slot their draw armed. It is the price of keying slots to Acks rather than to a clock the tag does not have.',
      zh: 'AMP Ack 并不携带标签可以依赖的时隙序号（SFD MM-46、PDT 39.4）：标签按到达顺序数 Ack，数到第 slot − 1 帧就开始发送。于是“漏掉一帧 Ack”不只是漏掉一帧 Ack，而是丢掉一整轮——标签少数一帧，晚一个时隙才发送，而 AP 只接收当前时隙里的回应，直接忽略它。本场景里这从未发生：余量高达几十分贝，180 次回应全部落在抽取所指定的时隙里。这就是“把时隙锚在 Ack 上、而不是锚在标签根本没有的时钟上”所要付的代价。',
    } },
    { heading: { en: 'Two phases: contend cheap, read expensive', zh: '两阶段：竞争用便宜的，读数用贵的' }, text: {
      en: 'The two-phase variant splits the two jobs. Its random phase asks only for identity: the response is 7 octets instead of 15, the slot 272 µs instead of 528 µs. Whoever is heard there is named in a second, scheduled trigger and answers with the reading in a slot fixed by list position — no draw, no collision. In the first round the random phase hears Tag 2, Tag 1 and Tag 4, and the scheduled trigger lists them in that order: 19 octets and 810 µs, because each listed tag costs a 2-octet ID.',
      zh: '两阶段变体把这两件事分开做。随机阶段只问身份，回应是 7 个字节而不是 15 个，时隙是 272 µs 而不是 528 µs。被听到的标签随后由第二帧“调度型”触发帧点名，并在名单位置决定的时隙里送出读数——不抽签，也就不可能碰撞。第一轮里随机阶段听到了 Tag 2、Tag 1 和 Tag 4，调度触发帧按这个顺序列出它们：19 个字节、810 µs，比广播触发帧长六个字节，因为名单里每个标签都要占 2 个字节的 ID。',
    } },
    { kind: 'formula', text: {
      en: 'random phase  = 50 + 10 + 618 + 4 × (10 + 272 + 10 + 330) = 3166 µs\nscheduled phase =      10 + 810 + 3 × (10 + 528 + 10 + 330) = 3454 µs   →  6620 µs',
      zh: '随机阶段 = 50 + 10 + 618 + 4 × (10 + 272 + 10 + 330) = 3166 µs\n调度阶段 =      10 + 810 + 3 × (10 + 528 + 10 + 330) = 3454 µs   →  6620 µs',
    }, note: {
      en: 'Inline delivered the same three readings in 4190 µs, so two-phase costs 2430 µs more. Its CTS-to-self reserves 7512 µs, sized for four tags heard; in 4 of the thirty rounds nobody is heard and no scheduled phase follows.',
      zh: '内联模式下同样的三个读数只花了 4190 µs，两阶段多花 2430 µs。它的 CTS-to-self 要预留 7512 µs——按“四个标签全被听到”的最坏情况计算；三十轮里有 4 轮一个标签也没听到，也就没有调度阶段。',
    } },
    { text: {
      en: 'Both modes deliver the same 46 readings: inline spends 154 730 µs of PPDU, two-phase 167 130 µs, 8.0 % more. Cheap contention slots do save, but a second trigger and a second Ack per tag cost more at these frame sizes. Two-phase earns its keep when the reading is long compared with an identity.',
      zh: '三十轮下来两种模式送达的读数一样多，都是 46 个：内联花了 154 730 µs 的 PPDU，两阶段花了 167 130 µs，多 8.0 %。便宜的竞争时隙确实省钱，但在这样的帧长下，多出来的一帧触发帧和每个标签多出来的一帧 Ack 更贵。两阶段划算的场合，是读数比身份长得多，或者 AP 需要一份可供调度的发现名单。',
    } },
    { kind: 'list', heading: { en: 'Where to read it', zh: '在哪里看' }, items: [
      { en: 'The log: “ABOC 1 of [0, 3] → slot 2”, “ABOC 5 of [0, 7] → sits out”, “slot 3: not acknowledged”.', zh: '日志里：“ABOC 1 of [0, 3] → slot 2”、“ABOC 5 of [0, 7] → sits out”、“slot 3: not acknowledged”。' },
      { en: 'The trigger body: “Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”; in two-phase “… 4 slots × 272 µs · id only”.', zh: '触发帧 6 个字节的帧体：“Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”，两阶段下则是“…… 4 slots × 272 µs · id only”。' },
    ] },
  ],
  scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'inline' }),
  variants: [
    { label: { en: 'ACWE 1 (ACW 1)', zh: 'ACWE 1（ACW 1）' }, scenario: () => ampSlotsScenario({ acwe: 1, readMode: 'inline' }) },
    { label: { en: 'ACWE 3 (ACW 7)', zh: 'ACWE 3（ACW 7）' }, scenario: () => ampSlotsScenario({ acwe: 3, readMode: 'inline' }) },
    { label: { en: 'Two-phase: id, then reading', zh: '两阶段：先报身份，再送读数' }, scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'twoPhase' }) },
  ],
  jumps: [
    J('first collision in a slot', '时隙里的第一次碰撞', firstCollision),
    J('first Ack naming the router itself', '第一帧点名路由器自己的 Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
    J('first lost response', '第一次回应丢失', firstAmpLost),
    J('first sit-out (ACWE 3 variant)', '第一次空转（ACWE 3 变体）', firstAmpSatOut),
    J('first scheduled trigger (two-phase variant)', '第一帧调度型触发帧（两阶段变体）', firstScheduledTrigger),
  ],
  observe: [
    { en: 'Jump to the first collision in a slot: three responses start at 2444 µs and end at 2972 µs, where the COLLISION sits. Open the Ack at 2982 µs — its ID field carries the router. Then look at the AP’s records: three RX_MISS and no RX_FAIL, because with equal power no preamble was acquired to fail.', zh: '跳到时隙里的第一次碰撞：三帧回应在 2444 µs 一起开始、在 2972 µs 结束，COLLISION 就落在那里。打开 2982 µs 那帧 Ack——它的 ID 字段装的是路由器。再看 AP 记下了什么：三条 RX_MISS，一条 RX_FAIL 也没有，因为功率相等时根本没有前导被捕获。' },
    { en: 'Select Tag 3 and step through five rounds. Its ABOC changes with no memory of what just happened, and over thirty rounds it draws all four values — nothing in a tag’s state is a window that grows after a collision.', zh: '选中 Tag 3，单步走过五轮。它的 ABOC 每轮都在变，完全不记得上一轮发生了什么；三十轮里四个取值它都抽到过。标签状态里没有“碰撞后会翻倍的竞争窗口”：取值范围来自触发帧，每轮一模一样。' },
    { en: 'Load the ACWE 3 variant and jump to the first sit-out at 678 µs: Tag 3 draws 5 of [0, 7] and stays silent all round. 42.5 % of the slots are empty — that is what buys the collision rate down to 14.2 %.', zh: '载入 ACWE 3 变体，跳到 678 µs 的第一次空转：Tag 3 从 [0, 7] 抽到 5，整轮一声不吭。42.5 % 的时隙是空的——碰撞率降到 14.2 %，买单的正是这些空时隙。' },
  ],
  tryThis: [
    { en: 'Load the ACWE 1 and ACWE 3 variants in turn, or set ACWE in the editor’s AMP polling section, and watch the readings that get through: 0.23 a round at ACWE 1, 1.53 at ACWE 2, 1.73 at ACWE 3. At ACWE 1 slots 3 and 4 carry nothing. Then work out from the formula which ACWE you would pick for two tags.', zh: '依次载入 ACWE 1 与 ACWE 3 两个变体，或在编辑器的 AMP 轮询设置里自己改 ACWE，看送达的读数如何变化：ACWE 1 每轮 0.23 个，ACWE 2 每轮 1.53 个，ACWE 3 每轮 1.73 个。ACWE 1 下时隙 3 和 4 里永远什么都没有。然后用公式推一推：如果只有两个标签而不是六个，你会选哪个 ACWE？' },
    { en: 'Add a seventh tag at the same 2 m range with the editor and reload. Delivery falls from 1.53 readings a round to 1.03 while the collided share of the slots climbs from 45.0 % to 59.2 % — the model predicts 55.5 %. Six tags into four slots was already past the knee.', zh: '用编辑器在同样 2 m 的距离上再加第七个标签，然后重新载入。送达率从每轮 1.53 个读数掉到 1.03 个，碰撞时隙占比从 45.0 % 升到 59.2 %——模型预测 55.5 %。六个标签抢四个时隙已经越过拐点。' },
  ],
  quiz: [
    {
      q: { en: 'At ACWE 1 with four slots on offer, why do slots 3 and 4 never carry anything?', zh: 'ACWE 1、本轮提供四个时隙时，为什么时隙 3 和 4 里永远什么都没有？' },
      options: [
        { en: 'The AP ends the round early once it has heard enough tags', zh: 'AP 听够了标签就提前结束这一轮' },
        { en: 'ACW + 1 = 2, so a draw of 0 or 1 can only arm slot 1 or slot 2', zh: 'ACW + 1 = 2，抽到的只能是 0 或 1，因此只可能指向时隙 1 或 2' },
        { en: 'The tags are too far away to be heard in the later slots', zh: '标签太远了，靠后的时隙里听不见它们' },
      ],
      answer: 1,
      explain: { en: 'ABOC is drawn from 0 to ACW = 1, so the armed slot is 1 or 2. The two unreachable slots still cost 1756 µs, 41.9 % of every round.', zh: 'ABOC 是从 0 到 ACW = 1 之间抽的，待发时隙只可能是 1 或 2。那两个够不着的时隙照样要花 1756 µs，占每轮的 41.9 %。' },
    },
    {
      q: { en: 'Three tags transmit in the same slot at the same received power. What does the AP record?', zh: '三个标签在同一个时隙里发送，到达功率也相同。AP 会记录下什么？' },
      options: [
        { en: 'Nothing decoded: three RX_MISS, one COLLISION, and a closing Ack that names the router', zh: '什么也没解出：三条 RX_MISS 加一条 COLLISION，收尾的 Ack 点名路由器' },
        { en: 'One RX_FAIL with reason capture, having locked on to the strongest of the three', zh: '一条原因为 capture 的 RX_FAIL——它锁定了三者中最强的一路' },
        { en: 'The first response, with the other two discarded as duplicates', zh: '收下第一帧回应，另外两帧当作重复丢弃' },
      ],
      answer: 0,
      explain: { en: 'Capture needs one signal 5 dB above the others, inside the 48 µs of AMP-Sync. On a ring of equal radius nothing has that margin, so no preamble is acquired at all.', zh: '捕获要求某一路比其他路高出 5 dB，而且要落在上行回应仅有的那 48 µs AMP-Sync 之内。等半径圆环上谁都没有这个余量，于是没有前导被捕获，整个运行里也不会出现原因为 capture 的 RX_FAIL。' },
    },
    {
      q: { en: 'Bianchi’s DCF model must be solved self-consistently for τ. Why can the AMP slot model be compared with a measurement directly?', zh: 'Bianchi 的 DCF 模型必须自洽求解 τ。为什么 AMP 的时隙模型可以直接拿去和实测比对？' },
      options: [
        { en: 'Because there are fewer stations, so the approximation is better', zh: '因为终端数更少，近似更准' },
        { en: 'Because the tag’s range comes from the trigger, never from its collision history, so q = 1/(ACW + 1) is known in advance', zh: '因为标签的取值范围来自触发帧，从不依赖碰撞历史，所以 q = 1/(ACW + 1) 事先就知道' },
        { en: 'Because the AP retransmits on the tag’s behalf after a collision', zh: '因为碰撞之后 AP 会代替标签重传' },
      ],
      answer: 1,
      explain: { en: 'Bianchi must solve for τ because a station’s window doubles with its collisions. An AMP tag has none of that: ACW is re-announced every round, so the transmission probability is an input, not an unknown.', zh: 'Bianchi 必须求解 τ，因为终端的窗口会随碰撞次数翻倍。AMP 标签没有窗口翻倍、没有冻结、没有历史：触发帧每轮都重新广播 ACW，于是发送概率是已知输入，而不是待解的未知数。' },
    },
  ],
}
