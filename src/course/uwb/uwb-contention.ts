/**
 * UWB Tier 2 · M14 · Other ranging modes · When the controller does not know who is there.
 *
 * Every UWB round so far has been a roll-call: the poll named each anchor and
 * the slot it had to answer in, and nothing could collide because nothing
 * chose. This lesson withdraws the list. The poll announces a window of S
 * response slots and nobody's name, each anchor that decodes it draws a slot
 * uniformly, and the tag finds out who is in the room by hearing them —
 * IEEE Std 802.15.4-2024's schedule mode 0.
 *
 * Six anchors ring the tag at exactly 3.50 m, so no answer can ever capture
 * another and a collision is always two answers lost. The lesson prices what
 * that costs: responses against the birthday-problem formula, collisions,
 * retries, sit-outs, the round's length — and the one cost that is easy to
 * miss, that the slot an anchor drew *is* its SS-TWR reply time, so a wider
 * window buys fewer collisions and worse ranges.
 * Every number quoted below is pinned in tests/course/uwb-contention.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling. The prose
 * below totals 1703 words, leaving room for 21 more and no others.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbContend, firstUwbContendCollision, firstUwbPoll, firstUwbPosition,
  firstUwbSitOut, oneRoom, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** The scene the lesson runs: the 8-slot base window, or one of its two variants. */
export type UwbContentionVariant = 'base' | 'slots4' | 'slots16'

/** Anchors on the ring: the `N` of the analytic model. */
export const CONTENTION_ANCHORS = 6
/** Every anchor is exactly this far from the tag, in metres. */
export const RING_RADIUS_M = 3.5
/** Ring centre — and the tag's place. The anchors share the tag's height, so the radius *is* the range. */
export const RING_CENTER = { x: 5, y: 4, z: 2.2 }
/** Response slots the poll advertises in each of the three scenes (the RCPS window). */
export const CONTENTION_SLOTS: Record<UwbContentionVariant, number> = { base: 8, slots4: 4, slots16: 16 }

/** Ring coordinates rounded to the micrometre, so every true range is 3.500000 m and the editor shows tidy numbers. */
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6

/**
 * Six anchors every 60° on a 3.5 m ring, starting due east, around one tag at
 * the centre of the 10 × 8 m lab. Anchors and tag all sit at z = 2.2, so the
 * ring radius is the whole 3-D range: all six true distances are 3.50 m and all
 * six answers reach the tag at the same level. That equality is the point — it
 * is what puts the medium's 6 dB capture rule out of reach here, so every
 * shared slot loses both answers and a collision is really a collision.
 *
 * SS-TWR, because a contention round has room for exactly one anchor-originated
 * frame; NLOS off and the crystals drawn, so the only error term that moves is
 * the one the draw itself controls. `contentionSlots` is the only thing the two
 * variants change.
 */
export function uwbContentionScenario(variant: UwbContentionVariant = 'base'): Scenario {
  const anchors = Array.from({ length: CONTENTION_ANCHORS }, (_, i) => {
    const rad = (i * 360 / CONTENTION_ANCHORS) * Math.PI / 180
    return anchor(
      `anchor-${i + 1}`, `Anchor ${i + 1}`,
      r6(RING_CENTER.x + RING_RADIUS_M * Math.cos(rad)),
      r6(RING_CENTER.y + RING_RADIUS_M * Math.sin(rad)),
      RING_CENTER.z,
    )
  })
  const tag = uwbTag('uwb-1', 'Phone', RING_CENTER.x, RING_CENTER.y, RING_CENTER.z)
  return uwbSc(oneRoom(), [...anchors, tag], {
    method: 'ss', nlos: false, schedule: 'contention', contentionSlots: CONTENTION_SLOTS[variant],
  })
}

export const uwbContention: Lesson = {
  id: 'uwb-contention',
  module: 14,
  title: { en: 'When the controller does not know who is there', zh: '控制器不知道有谁在场' },
  body: [
    { text: {
      en: 'Three things come from IEEE Std 802.15.4-2024. §10.32.2 defines the contention-based ranging round — schedule mode 0 — whose poll opens a shared response phase instead of naming a slot for each responder. §10.32.9.5 is the RCPS IE, which advertises that window; §10.32.9.6 is the RCMA IE, the attempts a responder may make. The NOTE in §10.32.1 leaves the filtering of wrong results to the upper layer, which is why nothing in the standard tells a responder its answer was lost. The rest is the model: the defaults of 8 slots and 3 attempts, the uniform draw, and the feedback loop that lets an anchor learn at a round’s end whether the tag ranged it.',
      zh: '本课有三处以 IEEE Std 802.15.4-2024 为依据。§10.32.2 定义了基于竞争的测距轮次——调度模式 0——它的轮询帧不再为每个应答者点名指派时隙，而是开出一段共享的应答阶段。§10.32.9.5 是 RCPS IE，用来通告这个窗口；§10.32.9.6 是 RCMA IE，规定应答者可以尝试的次数。§10.32.1 的 NOTE 把“筛掉错误结果”留给上层，这正是标准里没有任何机制告诉应答者“你的回答丢了”的原因。其余都是模型：8 个时隙与 3 次尝试这两个默认值、均匀抽取，以及那个让锚点在一轮结束时得知标签有没有测到自己的反馈回路。',
    } },
    { heading: { en: 'A roll-call needs a list', zh: '点名要先有名单' }, text: {
      en: 'Every round in the first UWB tier was a roll-call: the poll named each anchor and its slot, so nothing collided because nothing chose. That works while the controller holds a list, and often it holds none — a tag walks into a warehouse it has never seen. So the poll names nobody. It announces a window of S response slots; every device that decodes it draws one uniformly and answers there; and the controller learns who is present by hearing them.',
      zh: '第一阶段里的每一轮都是点名：轮询帧点出每个锚点的名字和它的时隙，于是没有东西会碰撞——因为没有东西需要挑选。但这一套成立的前提是控制器手里有名单，而很多时候它没有：标签走进一个从没来过的仓库。于是轮询帧谁的名字也不点。它只通告一段 S 个应答时隙的窗口；每一台解出它的设备都在其中均匀抽取一个并在那里作答；控制器则靠听见他们，来知道场上有谁。',
    } },
    { heading: { en: 'The scene', zh: '本课的场景' }, text: {
      en: 'Six anchors stand every 60° on a 3.5 m ring around one tag at the centre of the lab, all at the tag’s own height, so every true range is 3.50 m and every answer arrives at the same level. The method is SS-TWR — a contention round has room for one anchor-originated frame — and the variants change nothing but the window. A round is 1 + S slots of 2 ms: 10 ms at 4 slots, 18 at 8, 34 at 16, against 14 ms for a time-scheduled round of six anchors.',
      zh: '六个锚点沿一个半径 3.5 m 的圆环每 60° 站一个，围住实验室正中的标签，而且都与标签同高，于是每个真实距离都是 3.50 m，每路应答到达标签时的电平也完全相同。测距方式是 SS-TWR——一个竞争轮次里只放得下一个由锚点发起的帧——两个变体除了窗口之外什么都不改。一轮是 1 + S 个 2 ms 的时隙：4 个时隙时 10 ms，8 个时 18 ms，16 个时 34 ms；而六个锚点的时间调度轮次只要 14 ms。',
    } },
    { kind: 'formula', heading: { en: 'The birthday problem, with slots', zh: '换成时隙的生日问题' }, text: {
      en: 'P(alone in your slot) = (1 − 1/S)^(N−1)      expected responses = N·(1 − 1/S)^(N−1)\nN = 6 anchors:      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35',
      zh: 'P(独占自己的时隙) = (1 − 1/S)^(N−1)      期望应答数 = N·(1 − 1/S)^(N−1)\nN = 6 个锚点：      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35',
    }, note: {
      en: 'Each of the other N − 1 anchors misses your slot with probability 1 − 1/S, and the draws are independent, so your answer survives with (1 − 1/S)^(N−1); multiply by N for what the tag expects to hear. Doubling the window from 8 slots to 16 buys 1.27 more responses a round and costs 16 ms.',
      zh: '其余 N − 1 个锚点每一个都以 1 − 1/S 的概率避开你的时隙，各次抽取又相互独立，于是你的回答以 (1 − 1/S)^(N−1) 的概率活下来；再乘以 N，就是标签期望听到的应答数。窗口从 8 个时隙翻倍到 16 个，每轮只多换来 1.27 个应答，却要多付 16 ms。',
    } },
    { kind: 'table', heading: { en: 'Thirty rounds, three windows', zh: '三十轮，三种窗口' }, head: [
      { en: 'Response slots', zh: '应答时隙' }, { en: 'Round', zh: '轮次时长' }, { en: 'Formula', zh: '公式' },
      { en: 'Measured', zh: '实测' }, { en: 'Collided slots', zh: '碰撞时隙' }, { en: 'Sit-outs', zh: '空过' }, { en: 'Fixes', zh: '定位' },
    ], rows: [
      [N('4'), N('10 ms'), N('1.42'), N('1.57'), N('46'), N('23'), N('7 / 30')],
      [N('8'), N('18 ms'), N('3.08'), N('2.63'), N('43'), N('11'), N('15 / 30')],
      [N('16'), N('34 ms'), N('4.35'), N('4.13'), N('26'), N('1'), N('27 / 30')],
    ] },
    { heading: { en: 'Why the run is not the formula', zh: '为什么实测不等于公式' }, text: {
      en: 'No two rows deviate the same way: 4 slots comes out above the formula, 8 and 16 below. The sit-out column is why. The formula assumes six contenders every round; the retry rule leaves on average 5.23 at 4 slots, 5.63 at 8, 5.97 at 16. Put the real count back in and the expectation becomes 1.54, 3.02 and 4.33 a round. A thinner field helps at 4 slots, where n·(1 − 1/4)^(n−1) rises from 1.42 at six contenders to 1.69 at four, and hurts at every wider window. It accounts for the 4-slot run almost exactly — 47 against 46.1 — and for the 16-slot run within a sigma, 124 against 129.9; the 8-slot run’s 79 against 90.7 is 1.8 sigma low, ordinary scatter. All three sit inside a 4σ binomial envelope of the formula; none is the number it printed.',
      zh: '三行的偏离方向并不一致：4 个时隙高于公式，8 个和 16 个低于公式。原因在“空过”那一列。公式假定每轮都有六个竞争者；而重试规则留下的是平均 5.23 个（4 个时隙）、5.63 个（8 个）、5.97 个（16 个）。把真实数目代回去，每轮期望就变成 1.54、3.02 与 4.33。“场上人变稀”在 4 个时隙时是帮忙：n·(1 − 1/4)^(n−1) 从六人时的 1.42 升到四人时的 1.69；在更宽的窗口里则是帮倒忙。这几乎精确地解释了 4 个时隙那一行——47 对 46.1——也在一个 σ 之内解释了 16 个时隙那一行：124 对 129.9；8 个时隙的 79 对 90.7 偏低 1.8 个 σ，属寻常涨落。三个总数都落在公式的 4σ 二项包络之内，而没有一个等于公式印出来的那个数。',
    } },
    { heading: { en: 'Collisions, and why none of them is a capture', zh: '碰撞，以及为什么没有一次是捕获' }, text: {
      en: 'Two answers in one slot meet the medium’s ordinary rule: within 6 dB both are lost, beyond it the stronger is decoded and the weaker is not. Every anchor here is 3.50 m away at the same −14 dBm, so two colliding answers arrive within thousandths of a decibel and both die. Across the ninety rounds of the three scenes, not one range was decoded in a slot that also recorded a collision. The record is emitted for a capture too — an answer was lost either way — but there are none here to see.',
      zh: '同一个时隙里的两路应答，碰上的是介质那条寻常的规则：相差在 6 dB 以内则两路皆失，超过 6 dB 则较强的一路被解出、较弱的一路丢掉。而这里每个锚点离标签都是 3.50 m，发的都是同样的 −14 dBm，于是两路相撞的应答到达时只差千分之几个分贝，双双阵亡。三个场景的九十轮里，没有任何一次测距是在一个同时记录了碰撞的时隙里解出来的。真发生捕获时这条记录依然会记——反正都有一路应答丢了——但这个房间里一次也见不到。',
    } },
    { heading: { en: 'Retries, and a round nobody answers', zh: '重试，以及一轮不作声' }, text: {
      en: 'SS-TWR ends at the tag: there is no Final, so an anchor whose answer was lost is never told. The model closes that loop at the round boundary. An anchor the tag did not range returns at attempt 2, then 3, and if the third fails it sits a whole round out — the RCMA budget of 3. anchor-2 runs out first: attempts 1, 2 and 3 in rounds 0, 1 and 2, then “anchor-2 sits out this round” in round 3, with no draw at all. Thirty rounds hold eleven sit-outs at 8 slots, twenty-three at 4 and exactly one at 16.',
      zh: 'SS-TWR 在标签那里就结束了：没有 Final 帧，所以应答被丢掉的锚点永远不会被告知。模型改为在轮次边界上把这个回路闭上。标签没有测到的锚点会以第 2 次尝试回来，再以第 3 次；第三次仍失败，它就整整空过一轮——这就是 RCMA 给的 3 次预算。anchor-2 第一个用完预算：第 0、1、2 轮分别是第 1、2、3 次尝试，接着在第 3 轮打出 “anchor-2 sits out this round”，根本不抽时隙。三十轮里，8 个时隙时有十一次这样的空过，4 个时隙时二十三次，16 个时隙时恰好一次。',
    } },
    { heading: { en: 'The slot you drew is the reply time you pay', zh: '抽到第几个时隙，就付多长的应答时延' }, text: {
      en: 'Lesson 2 left one error term standing after the clock-offset correction: half the reply time times its 0.2 ppm residual — 3.0 cm of 1-σ per millisecond of waiting, 6.0 cm per 2 ms slot. In a roll-call that cost is fixed by the schedule; in a contention round it is a die roll, and a wider window is a bigger die. The RMS range error over thirty rounds is 14.6 cm at 4 slots, 26.8 at 8 and 51.4 at 16 — against 20.4 cm time-scheduled. Widening the window buys fewer collisions and worse ranges, and that cost lands in the accuracy, where nobody is watching.',
      zh: '第 2 课在做完时钟偏差修正之后只剩下一个误差项：应答时延的一半乘以其中残留的 0.2 ppm——每多等 1 ms 就是 3.0 cm 的 1σ，每个 2 ms 的时隙 6.0 cm。点名式轮次里这笔代价由调度表固定；竞争轮次里它是一次掷骰子，窗口越宽，骰子的面数越多。三十轮的测距误差 RMS 是：4 个时隙 14.6 cm，8 个时隙 26.8 cm，16 个时隙 51.4 cm——而时间调度是 20.4 cm。把窗口加宽，换来的是更少的碰撞和更差的距离，而这笔代价落在精度上，落在没人盯着的地方。',
    } },
    { heading: { en: 'When to prefer the roll-call', zh: '什么时候该回到点名' }, text: {
      en: 'The base scene delivers 79 ranges and 15 fixes in thirty rounds, the first fix not until block 6, 1.218 s in. The same six anchors time-scheduled deliver 180 responses and 30 fixes, in a round 4 ms shorter. Contention is not a way of making a known set of anchors faster — on every axis here it is strictly worse. It is a way of talking to a set you do not know yet; once the controller has the list, a real deployment writes it into a time-scheduled round and never draws again.',
      zh: '基准场景在三十轮里给出 79 次测距、15 次定位，而第一次定位要等到第 6 个块、1.218 s 才出现。同样六个锚点改用时间调度，则是 180 次应答、30 次定位，而且每轮还短 4 ms。基于竞争并不是让一组已知锚点跑得更快的办法——在本课衡量的每一个维度上它都严格地更差。它是用来与一组你还不认识的设备说话的办法；一旦控制器拿到了名单，真实的部署就会把它写进一个时间调度的轮次，从此再也不抽签。',
    } },
  ],
  scenario: () => uwbContentionScenario('base'),
  variants: [
    { label: { en: '4 response slots', zh: '4 个应答时隙' }, scenario: () => uwbContentionScenario('slots4') },
    { label: { en: '16 response slots', zh: '16 个应答时隙' }, scenario: () => uwbContentionScenario('slots16') },
  ],
  jumps: [
    J('the poll that opens the window', '开出窗口的那个轮询帧', firstUwbPoll),
    J('the first anchor to draw a slot', '第一个抽到时隙的锚点', firstUwbContend),
    J('the first slot two anchors both chose', '第一个被两个锚点同时选中的时隙', firstUwbContendCollision),
    J('the first anchor to run out of attempts', '第一个用完尝试次数的锚点', firstUwbSitOut),
    J('the first fix, six rounds in', '六轮之后才出现的第一次定位', firstUwbPosition),
  ],
  observe: [
    { en: 'At 198.666 µs the log prints all six draws at once: anchor-1 slot 4, anchor-2 slot 7, anchor-3 slot 1, anchor-4 slot 4, anchor-5 slot 8, anchor-6 slot 7, every one “attempt 1”. Two pairs picked the same slot, so six anchors yield two ranges.',
      zh: '198.666 µs 处，日志一口气打出六次抽取：anchor-1 抽到时隙 4，anchor-2 抽到 7，anchor-3 抽到 1，anchor-4 抽到 4，anchor-5 抽到 8，anchor-6 抽到 7，每一条都是“attempt 1”。有两对撞在同一个时隙上，于是六个锚点只换来两次测距。' },
    { en: 'At 8.187 ms the tag prints “uwb-1 contention collision in slot 4” — one record per slot, not per answer lost — and its inspector grows a “slots collided” row that reaches 43. No UWB_TIMEOUT appears anywhere in the run: nobody was ever scheduled in an empty contention slot.',
      zh: '8.187 ms 处标签打出 “uwb-1 contention collision in slot 4”——一个时隙一条记录，而不是每丢一路应答记一条——它的检视面板也多出一行“碰撞时隙数”，最终停在 43。整段运行里一条 UWB_TIMEOUT 也没有：空着的竞争时隙里，本来就没有约过谁。' },
    { en: 'Follow anchor-2: “contends: slot 7 (attempt 1)” in round 0, attempt 2 in round 1, attempt 3 in round 2, and in round 3 “anchor-2 sits out this round”, with no draw at all. Its inspector row reads “contention draw · sitting this round out” for that whole round.',
      zh: '跟住 anchor-2：第 0 轮是 “contends: slot 7 (attempt 1)”，第 1 轮第 2 次尝试，第 2 轮第 3 次尝试，第 3 轮则是 “anchor-2 sits out this round”，一个时隙也不抽。那一整轮里，它检视面板上的那一行都写着“竞争抽取 · 本轮空过”。' },
    { en: 'The tag’s first position is in block 6, at 1.218 s: six rounds went by without the three ranges a fix needs. Fifteen of the thirty rounds produce a fix, and six of those fifteen have only three anchors to work with.',
      zh: '标签的第一次定位出现在第 6 个块、1.218 s：此前六轮都凑不齐解出位置所需的三次测距。三十轮里有十五轮给出了定位，而这十五次里有六次只有三个锚点可用。' },
  ],
  tryThis: [
    { en: 'Load “16 response slots”. Collided slots fall from 43 to 26 and fixes rise from 15 to 27 of 30 — but the round grows from 18 ms to 34 ms and the RMS range error nearly doubles, 26.8 cm to 51.4 cm, because the average answer now waits eight and a half slots instead of four and a half. Then load “4 response slots”: 46 collided slots, 23 sit-outs and 7 fixes in thirty rounds, every one on the bare minimum of three anchors.',
      zh: '载入“16 个应答时隙”。碰撞时隙从 43 降到 26，定位从 15 次升到 30 轮中的 27 次——但一轮从 18 ms 变成 34 ms，测距误差的 RMS 也几乎翻倍，从 26.8 cm 到 51.4 cm，因为平均而言一路应答现在要等八点五个时隙，而不是四点五个。再载入“4 个应答时隙”：46 个碰撞时隙、23 次空过，三十轮只有 7 次定位，而且每一次都只勉强用上三个锚点。' },
    { en: 'In the editor, set Schedule to “time-scheduled” on the base scene and reload. The round shrinks to 7 slots and 14 ms, all 180 responses arrive, all 30 rounds produce a fix, and Response slots and Attempts grey out. Note the one number that gets worse: 20.4 cm of RMS range error against the 4-slot run’s 14.6 cm. A roll-call of six anchors must reach slot 6; a 4-slot window never gets past slot 4.',
      zh: '在编辑器里把基准场景的“调度”改成“时间调度”并重新载入。一轮缩到 7 个时隙、14 ms，180 次应答一次不落，30 轮全部解出定位，“响应时隙数”和“尝试次数”两个输入框变灰。请注意唯一变差的那个数：测距误差 RMS 为 20.4 cm，而 4 个时隙那一次是 14.6 cm。六个锚点的点名必须排到第 6 个时隙，而 4 个时隙的窗口永远走不过第 4 个。' },
  ],
  quiz: [
    {
      q: { en: 'At 4 response slots the six anchors deliver 1.57 ranges a round where N·(1 − 1/S)^(N−1) predicts 1.42. Why is the run above the formula?', zh: '在 4 个应答时隙下，六个锚点每轮给出 1.57 次测距，而 N·(1 − 1/S)^(N−1) 预测 1.42。为什么实测高于公式？' },
      options: [
        { en: 'Capture lets the stronger of two colliding answers through', zh: '捕获效应让两路相撞的应答中较强的一路通过了' },
        { en: 'Sit-outs leave fewer than six anchors contending — 5.23 on average — and at 4 slots a thinner field wins more slots', zh: '空过使参与竞争的锚点不足六个——平均 5.23 个——而在 4 个时隙下，场上越稀，赢下的时隙反而越多' },
        { en: 'The tag re-polls the collided slots later in the same round', zh: '标签在同一轮的后面重新轮询了发生碰撞的那些时隙' },
      ],
      answer: 1,
      explain: { en: 'With n contenders the expectation is n·(1 − 1/4)^(n−1), which rises from 1.42 at six to 1.69 at four. Feeding the measured 5.23 back in gives 1.54 against the run’s 1.57. At 8 and 16 slots the same thinning pushes the other way. Capture is impossible here: all six anchors are 3.50 m away.', zh: '竞争者为 n 个时，期望是 n·(1 − 1/4)^(n−1)：从六人时的 1.42 升到四人时的 1.69。把实测的 5.23 代回去得到 1.54，而实测是 1.57。在 8 个和 16 个时隙下，同样的“变稀”把结果推向另一个方向。至于捕获，这里根本不可能：六个锚点都在 3.50 m 处。' },
    },
    {
      q: { en: 'Most response slots in this run are empty, yet not one UWB_TIMEOUT is emitted in any of the three scenes. Why not?', zh: '这段运行里大多数应答时隙都是空的，可三个场景中一条 UWB_TIMEOUT 也没有。为什么？' },
      options: [
        { en: 'Timeouts are suppressed while a collision in the same round is still pending', zh: '只要同一轮里还有碰撞没结算，超时记录就会被压住' },
        { en: 'The tag listens on an open expectation: nobody is scheduled in a contention slot, so there is no peer the record could name', zh: '标签是以“开放期待”在听：竞争时隙里没有安排任何人，这条记录没有对端可写' },
        { en: 'SS-TWR has no timeout at all, because it has no Final frame', zh: 'SS-TWR 根本没有超时，因为它没有 Final 帧' },
      ],
      answer: 1,
      explain: { en: 'A timeout names the peer that failed to answer, and a contention slot has no such peer — the tag opened it to anyone. An empty slot is the ordinary outcome of the draw, not a fault. Anchors still time out on a poll they miss.', zh: '超时记录要写明是哪个对端没有应答，而竞争时隙里不存在这样一个对端——标签把它对所有人开放。空时隙是抽取的正常结果，不是故障。锚点漏掉轮询帧时照样会超时。' },
    },
    {
      q: { en: 'Same room, same six anchors, same radio: why are the 16-slot window’s ranges three and a half times worse than the 4-slot window’s?', zh: '同一个房间、同样六个锚点、同样的射频：为什么 16 个时隙窗口下的测距误差是 4 个时隙窗口的三点五倍？' },
      options: [
        { en: 'The drawn slot is the reply time, and SS-TWR keeps ½·Treply·0.2 ppm of residual — 6.0 cm of 1-σ per slot', zh: '抽到的时隙就是应答时延，而 SS-TWR 留下 ½·Treply·0.2 ppm 的残差——每个时隙 6.0 cm 的 1σ' },
        { en: 'More slots mean more collisions, and a collided timestamp is still used, with a worse FoM', zh: '时隙越多碰撞越多，而碰撞过的时间戳仍会被使用，只是 FoM 更差' },
        { en: 'A wider response window spreads the transmit power thinner, so the SNR falls', zh: '更宽的应答窗口把发射功率摊薄了，于是信噪比下降' },
      ],
      answer: 0,
      explain: { en: 'Drawing slot k means waiting k × 2 ms, so 6.0 cm of 1-σ per slot. The base run shows the ramp directly: its per-slot RMS climbs 7.3, 14.9, 16.2, 23.5, 28.2, 32.0, 22.8 and 47.1 cm across the eight slots.', zh: '抽到第 k 个时隙就意味着要等 k × 2 ms，于是每个时隙 6.0 cm 的 1σ。基准场景直接把这道斜坡摆了出来：八个时隙上的分时隙 RMS 依次是 7.3、14.9、16.2、23.5、28.2、32.0、22.8 与 47.1 cm。' },
    },
  ],
}
