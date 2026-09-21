/**
 * UWB Tier 2 · M14 · Other ranging modes · When the controller does not know who is there.
 *
 * Every UWB round so far has been a roll call: the poll named each anchor and
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
 * miss, that the slot an anchor drew *is* its reply time, so a wider window
 * buys fewer collisions and worse ranges.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the draw in
 * plain words first, the formula and the three measured windows after it, the
 * per-slot error ramp and the absent timeouts in `deeper`, the clauses and the
 * model's own defaults in `sources`. Every number quoted below is pinned in
 * tests/course/uwb-contention.test.ts; `npx tsx scripts/lesson-dump.ts
 * uwb-contention en` prints the section budgets.
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
  why: {
    en: 'Every ranging round so far has been a roll call: the poll named each anchor and the slot it had to answer in, so nothing ever collided, because nothing ever chose. That only works while the controller holds a list of who is in the room, and a phone walking into a strange warehouse holds no list. This lesson is the other mode — the poll names nobody, opens a window, and lets whoever is listening draw a slot.',
    zh: '到目前为止，每一轮测距都是一次点名：轮询帧点出每个锚点的名字和它该作答的时隙，于是从来不会发生碰撞——因为从来没有谁需要挑选。可这一套成立的前提，是控制器手里有一份“谁在场”的名单。而一部刚走进陌生仓库的手机，根本没有名单。这一课讲的是另一种模式：轮询帧谁的名字也不点，只开出一段窗口，让听见它的人自己抽一个时隙。',
  },
  outcomes: [
    { en: 'say why a poll that names nobody produces collisions, and roughly how many', zh: '说清一个不点名的轮询帧为什么会引起碰撞，以及大致会有多少' },
    { en: 'read a draw, a collision and a sit-out off the log', zh: '从日志里读出一次抽取、一次碰撞和一次空过' },
    { en: 'weigh a wider answering window against the range error it buys', zh: '在“更宽的应答窗口”与“它换来的测距误差”之间做权衡' },
  ],
  needs: ['uwb-coexist'],
  terms: [
    { term: 'response window', plain: {
      en: 'the run of slots a poll opens for anybody to answer in, naming nobody',
      zh: '轮询帧开出的一串时隙，谁都可以在里面作答，而它一个名字也不点',
    } },
    { term: 'RCPS', plain: {
      en: 'the little list inside the poll that advertises the window and how many slots it holds',
      zh: '轮询帧里那张小清单，用来通告这个窗口，以及它有多少个时隙',
    } },
    { term: 'RCMA', plain: {
      en: 'the list that says how many times in a row a device may keep trying',
      zh: '另一张清单，规定一台设备最多可以连着尝试几次',
    } },
    { term: 'sit-out', plain: {
      en: 'a whole round a device stays silent for, because its tries ran out',
      zh: '一台设备整整一轮不出声，因为它的尝试次数用完了',
    } },
  ],
  picture: [
    { heading: { en: 'A roll call needs a list', zh: '点名要先有名单' }, text: {
      en: 'Every round of the first UWB tier was a roll call. The poll named each anchor and its slot, so nothing collided because nothing chose. All of that rests on the controller already knowing who is in the room — which, often enough, it does not.',
      zh: 'UWB 第一阶段里的每一轮都是点名：轮询帧点出每个锚点和它的时隙，于是没有东西会碰撞——因为没有东西需要挑选。可这一切都建立在“控制器已经知道场上有谁”之上——而很多时候，它并不知道。',
    } },
    { heading: { en: 'So the poll names nobody', zh: '于是轮询帧谁也不点' }, text: {
      en: 'Instead it opens a response window: a run of slots that belong to nobody in particular. A short list inside the poll, the RCPS, says how many there are. Every device that decodes the poll picks one at random and answers there, and the controller learns who is present by hearing them.',
      zh: '取而代之的是开出一段应答窗口：一串不属于任何特定设备的时隙。轮询帧里有一张短清单，叫 RCPS，写明这里一共有几个时隙。每一台解出这个轮询帧的设备都从中随机挑一个，在那里作答；控制器则靠听见他们，来知道场上有谁。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Watch six anchors draw', zh: '看六个锚点各抽一个' }, text: {
      en: 'Load the simulation and press play, then jump to the first anchor to draw. All six draw at the same instant, off the same poll, and the log prints six lines at once. Read the slot numbers: look for two that match.',
      zh: '载入仿真、按下播放，然后跳到第一个抽到时隙的锚点。六个锚点在同一刻、根据同一个轮询帧各抽一次，日志一口气打出六行。读一读这些时隙号，看看有没有两个撞在一起。',
    } },
    { heading: { en: 'Two answers in one slot lose both', zh: '同一个时隙里的两路应答，双双阵亡' }, text: {
      en: 'Two anchors answering in one slot meet the medium’s ordinary rule: if one is much louder it is decoded; otherwise both are lost. Here every anchor stands the same distance from the phone and transmits the same power, so neither can shout the other down. Every shared slot costs two answers.',
      zh: '两个锚点在同一个时隙里作答，碰上的是介质那条寻常的规则：若一路明显比另一路响，就解出较响的那一路，否则两路皆失。而在这个房间里，每个锚点离手机的距离相同、发射功率也相同，于是谁也压不过谁。每一个被共用的时隙，都要赔上两路应答。',
    } },
    { heading: { en: 'Nobody tells a loser', zh: '没有谁会去通知失败者' }, text: {
      en: 'The measurement finishes at the phone and nothing goes back to the anchor, so an anchor whose answer died is never told. The model closes that loop at the round boundary: an anchor the phone did not range comes back next round and tries again. Its RCMA budget says how many tries it gets; when they run out it takes a sit-out.',
      zh: '在这种模式里，测量在手机那一侧就结束了，没有任何东西回到锚点，所以应答死掉的锚点永远不会被告知。模型改为在轮次边界上把这个回路闭上：手机没有测到的锚点，下一轮回来再试一次。它能试几次由 RCMA 的预算说了算；次数用完，它就空过一轮，连时隙也不抽。',
    } },
    { kind: 'watch', jump: 3, heading: { en: 'Watch one anchor give up', zh: '看一个锚点放弃' }, text: {
      en: 'Jump to the first anchor to run out of tries. Three rounds running it drew a slot and was never heard; in the fourth it stays quiet. Its lane shows nothing that round — no draw, no answer, no failure.',
      zh: '跳到第一个用完尝试次数的锚点。连着三轮它都抽了时隙，却一次也没被听见；到第四轮，它干脆不作声了。那一轮它的泳道上什么也没有——没有抽取，没有应答，也没有失败。',
    } },
    { heading: { en: 'The slot you drew is the wait you pay', zh: '抽到第几个时隙，就等多久' }, text: {
      en: 'Here is the cost easy to miss. The anchor answers in the slot it drew, so the slot number is how long the phone waited — and the longer the wait, the further the two crystals drift apart. A roll call fixes that wait; here it is a die roll, and a wider window is a bigger die.',
      zh: '这里有一笔容易被忽略的账。锚点是在自己抽到的那个时隙里作答的，抽到第几号时隙，手机就得等多久——而等得越久，两只晶振漂开得也越多。点名式的轮次里，这段等待由日程表钉死；而在这里它是一次掷骰子，窗口越宽，骰子的面数越多。',
    } },
    { heading: { en: 'When to go back to the roll call', zh: '什么时候该回到点名' }, text: {
      en: 'So a wider window buys fewer collisions and worse ranges, a narrower one the other way round. Either way, once the controller has a list the roll call wins on every axis measured here. Drawing for slots is not a way to make known anchors faster; it is how you talk to devices you have never met.',
      zh: '所以，窗口越宽，碰撞越少而距离越差；窗口越窄则反过来。而无论哪一边，只要控制器手里有了名单，点名在本课衡量的每一个维度上都赢。抽签抢时隙不是让一批已知锚点跑得更快的手段，而是用来跟你还没见过的设备搭上话。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'The birthday problem, with slots instead of birthdays', zh: '把生日换成时隙的生日问题' }, text: {
      en: 'P(alone in your slot) = (1 − 1/S)^(N−1)      expected responses = N·(1 − 1/S)^(N−1)\nN = 6 anchors:      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35',
      zh: 'P(独占自己的时隙) = (1 − 1/S)^(N−1)      期望应答数 = N·(1 − 1/S)^(N−1)\nN = 6 个锚点：      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35',
    }, note: {
      en: 'Every anchor picks independently, so your answer survives only if none of the other five landed on your slot. Multiply that chance by six for what the phone expects to hear.',
      zh: '每个锚点都独立地抽，所以只有当其余五个都没落在你这个时隙上，你的回答才活得下来；再拿这个概率乘以六，就是手机期望听到的应答数。',
    } },
    { kind: 'table', heading: { en: 'Thirty rounds, three windows', zh: '三十轮，三种窗口' }, head: [
      { en: 'Response slots', zh: '应答时隙' }, { en: 'Round', zh: '轮次时长' }, { en: 'Formula', zh: '公式' },
      { en: 'Measured', zh: '实测' }, { en: 'Collided slots', zh: '碰撞时隙' }, { en: 'Sit-outs', zh: '空过' }, { en: 'Fixes', zh: '定位' },
    ], rows: [
      [N('4'), N('10 ms'), N('1.42'), N('1.57'), N('46'), N('23'), N('7 / 30')],
      [N('8'), N('18 ms'), N('3.08'), N('2.63'), N('43'), N('11'), N('15 / 30')],
      [N('16'), N('34 ms'), N('4.35'), N('4.13'), N('26'), N('1'), N('27 / 30')],
      [{ en: 'roll call, 6 anchors', zh: '点名，6 个锚点' }, N('14 ms'), N('6.00'), N('6.00'), N('0'), N('0'), N('30 / 30')],
    ] },
    { kind: 'table', heading: { en: 'Why the run is not the formula', zh: '为什么实测不等于公式' }, head: [
      { en: 'Response slots', zh: '应答时隙' }, { en: 'Contenders a round', zh: '每轮竞争者' },
      { en: 'Expected with that many', zh: '按这个人数的期望' }, { en: 'Responses in thirty rounds', zh: '三十轮的应答总数' },
    ], rows: [
      [N('4'), N('5.23'), N('1.54'), N('47 against 46.1 · 0.2 σ')],
      [N('8'), N('5.63'), N('3.02'), N('79 against 90.7 · 1.8 σ')],
      [N('16'), N('5.97'), N('4.33'), N('124 against 129.9 · 1.0 σ')],
    ] },
    { text: {
      en: 'The formula assumes six contenders every round, and the sit-outs mean there are never six. A thinner field helps at four slots, lifting the expectation from 1.42 to 1.69, and hurts at every wider window — exactly the direction each row deviates in.',
      zh: '公式假定每一轮都有六个竞争者，而空过意味着永远不到六个。场上变稀，在四个时隙时是帮忙的——它把期望从 1.42 抬到 1.69；在更宽的窗口里则是帮倒忙。三行各自偏离的方向，恰好就是这样来的。',
    } },
    { kind: 'table', heading: { en: 'Round 0: six draws, two ranges', zh: '第 0 轮：六次抽取，两次测距' }, head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Drew', zh: '抽到' }, { en: 'Outcome', zh: '结果' },
    ], rows: [
      [N('anchor-1'), N('slot 4'), { en: 'lost, shared with anchor-4', zh: '丢失，与 anchor-4 撞在一起' }],
      [N('anchor-2'), N('slot 7'), { en: 'lost, shared with anchor-6', zh: '丢失，与 anchor-6 撞在一起' }],
      [N('anchor-3'), N('slot 1'), { en: 'ranged', zh: '测到' }],
      [N('anchor-4'), N('slot 4'), { en: 'lost', zh: '丢失' }],
      [N('anchor-5'), N('slot 8'), { en: 'ranged', zh: '测到' }],
      [N('anchor-6'), N('slot 7'), { en: 'lost', zh: '丢失' }],
    ] },
    { kind: 'table', heading: { en: 'What a wider window costs', zh: '窗口加宽的代价' }, head: [
      { en: 'Response slots', zh: '应答时隙' }, { en: 'Average wait', zh: '平均等待' }, { en: 'Typical range error', zh: '典型测距误差' },
    ], rows: [
      [N('4'), N('2.5 slots'), N('14.6 cm')],
      [N('8'), N('4.5 slots'), N('26.8 cm')],
      [N('16'), N('8.5 slots'), N('51.4 cm')],
      [{ en: 'roll call, 6 anchors', zh: '点名，6 个锚点' }, { en: 'set by the schedule', zh: '由日程表定死' }, N('20.4 cm')],
    ] },
    { text: {
      en: 'A single-sided measurement keeps a residual of 3.0 cm for every millisecond the answer waits, so 6.0 cm a slot. That is the whole of the table above: the drawn slot is the reply time, and a wider window is a longer wait.',
      zh: '单边测距会留下一项残差：应答每多等一毫秒，就是 3.0 cm，于是每个时隙 6.0 cm。上面那张表讲的就是这一件事：抽到的时隙就是应答时延，而窗口越宽，等得越久。',
    } },
    { heading: { en: 'Latency', zh: '时延' }, text: {
      en: 'Latency lands on the same side. The base scene needs six rounds before one holds three ranges, so its first position is at 1.218 s; the roll call has one from the first round, in a round 4 ms shorter.',
      zh: '时延也站在同一边。基准场景要等六轮，才有某一轮凑齐三次测距，所以它的第一次定位落在 1.218 s；而点名从第一轮起就每轮都有，而且每轮还短 4 ms。',
    } },
  ],
  deeper: [
    { heading: { en: 'What thirty rounds actually deliver', zh: '三十轮到底交出了什么' }, text: {
      en: 'The base scene delivers 79 of a possible 180 responses and 15 fixes in thirty rounds, six of those fifteen on only three anchors, and the first not until block 6 at 1.218 s. The same six anchors on a roll call deliver 180 responses and 30 fixes. At four slots all seven fixes are on the bare minimum of three anchors. Doubling the window from 8 slots to 16 buys 1.27 more responses a round and costs 16 ms. All three totals sit inside a 4σ binomial envelope of the printed formula, and none is the number it printed.',
      zh: '基准场景在三十轮里交出 79 次应答（满打满算本可有 180 次）与 15 次定位，这十五次里有六次只用上三个锚点，而第一次要等到第 6 个块、1.218 s 才出现。同样六个锚点改用点名，则是 180 次应答、30 次定位。四个时隙时，七次定位全都只勉强用上三个锚点。窗口从 8 个时隙翻倍到 16 个，每轮只多换来 1.27 个应答，却要多付 16 ms。三个总数都落在所印公式的 4σ 二项包络之内，而没有一个等于公式印出来的那个数。',
    } },
    { heading: { en: 'The error ramp, slot by slot', zh: '一格一格爬上去的误差' }, text: {
      en: 'The base run shows the residual directly. Its per-slot RMS range error climbs 7.3, 14.9, 16.2, 23.5, 28.2, 32.0, 22.8 and 47.1 cm across the eight response slots — a ramp of roughly 6 cm a slot, with the scatter of a handful of samples in each bucket. Over the whole run that is 26.8 cm, against 14.6 at four slots and 51.4 at sixteen: 51.4 / 14.6 is three and a half.',
      zh: '基准场景把这项残差直接摆了出来。八个应答时隙上的分时隙测距误差 RMS 依次是 7.3、14.9、16.2、23.5、28.2、32.0、22.8 与 47.1 cm——大约每格 6 cm 的一道斜坡，各格里样本不多，所以带着起伏。整段运行合起来是 26.8 cm，而四个时隙是 14.6 cm、十六个时隙是 51.4 cm：51.4 除以 14.6，正好三点五倍。',
    } },
    { heading: { en: 'Why there is not one timeout', zh: '为什么一条超时也没有' }, text: {
      en: 'Most response slots in these runs are empty, and yet no timeout record is emitted in any of the three scenes. A timeout has to name the peer that failed to answer, and a contention slot has no such peer: the phone opened it to anyone at all. An empty slot is the ordinary outcome of the draw, not a fault. Anchors still time out on a poll they miss. What a shared slot does emit reads “uwb-1 contention collision in slot 4”: one record per slot, not one per answer lost.',
      zh: '这三个场景里大多数应答时隙都是空的，可一条超时记录也没有。超时记录必须写明是哪个对端没有应答，而竞争时隙里不存在这样一个对端——手机是把它向所有人开放的。空时隙是抽取的正常结果，不是故障。锚点漏掉轮询帧时，照样还是会超时的。而被共用的时隙确实会记一条：“uwb-1 contention collision in slot 4”——一个时隙一条，不是每丢一路应答记一条。',
    } },
    { heading: { en: 'No capture, at these distances', zh: '这样的距离上，不会有捕获' }, text: {
      en: 'The medium lets the stronger of two overlapping frames through when it leads by 6 dB. Every anchor here is 3.50 m from the phone and transmits at the same −14 dBm, so two colliding answers arrive within thousandths of a decibel of each other. Across the ninety rounds of the three scenes, not one range was decoded in a slot that also recorded a collision.',
      zh: '两帧相叠时，只要较强的一路领先 6 dB，介质就放它过去。而这里每个锚点离手机都是 3.50 m，发的都是同样的 −14 dBm，于是两路相撞的应答到达时只差千分之几个分贝。三个场景九十轮里，没有任何一次测距是在一个同时记录了碰撞的时隙里解出来的。',
    } },
  ],
  sources: [
    { en: 'IEEE Std 802.15.4-2024 §10.32.2 defines the contention-based ranging round — schedule mode 0 — whose poll opens a shared response phase instead of naming a slot for each responder.',
      zh: 'IEEE Std 802.15.4-2024 的 §10.32.2 定义了基于竞争的测距轮次——调度模式 0——它的轮询帧不再为每个应答者点名指派时隙，而是开出一段共享的应答阶段。' },
    { en: '§10.32.9.5 is the RCPS IE, which advertises that window; §10.32.9.6 is the RCMA IE, the attempts a responder may make.',
      zh: '§10.32.9.5 是 RCPS IE，用来通告这个窗口；§10.32.9.6 是 RCMA IE，规定应答者可以尝试的次数。' },
    { en: 'The NOTE in §10.32.1 leaves the filtering of wrong results to the upper layer, which is why nothing in the standard tells a responder its answer was lost.',
      zh: '§10.32.1 的 NOTE 把“筛掉错误结果”留给上层，这正是标准里没有任何机制告诉应答者“你的回答丢了”的原因。' },
    { en: 'The rest is the model: the defaults of 8 slots and 3 attempts, the uniform draw, the 6 dB capture margin, and the feedback loop that lets an anchor learn at a round’s end whether the phone ranged it.',
      zh: '其余都是模型：8 个时隙与 3 次尝试这两个默认值、均匀抽取、6 dB 的捕获余量，以及那个让锚点在一轮结束时得知手机有没有测到自己的反馈回路。' },
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
    { en: 'The six draws print at one instant: “anchor-1 contends: slot 4 (attempt 1)”, and five more like it. Two pairs picked the same slot. The collision record names the slot, not the answers lost in it, and the inspector’s “slots collided” row counts the same way.',
      zh: '六次抽取在同一刻打印出来：“anchor-1 contends: slot 4 (attempt 1)”，另外五条也是这个样子。有两对撞在了同一个时隙上。碰撞记录写的是时隙，不是在里面丢掉的应答；检视面板上的“碰撞时隙数”那一行，数的也是同一样东西。' },
    { en: 'Follow anchor-2. It draws in three rounds running, is never heard, and in the fourth the log prints “anchor-2 sits out this round” with no draw at all. Its inspector row reads “contention draw · sitting this round out” for that whole round.',
      zh: '跟住 anchor-2。它连着三轮都抽了时隙，却一次也没被听见；到第四轮，日志打出 “anchor-2 sits out this round”，一个时隙也不抽。那一整轮里，它检视面板上的那一行都写着“竞争抽取 · 本轮空过”。' },
  ],
  tryThis: [
    { en: 'Load “16 response slots”. Collided slots fall and fixes nearly double, but the round grows to 34 ms and the range error nearly doubles too: the average answer now waits eight and a half slots instead of four and a half. Then load “4 response slots” and watch the fixes collapse.',
      zh: '载入“16 个应答时隙”。碰撞时隙变少，定位几乎翻倍——但一轮长到 34 ms，测距误差也几乎翻倍，因为平均一路应答现在要等八点五个时隙，而不是四点五个。再载入“4 个应答时隙”，看定位怎么塌下去。' },
    { en: 'In the editor, set Schedule to “time-scheduled” on the base scene and reload. Every response arrives, every round gives a fix, and Response slots and Attempts grey out. One number gets worse — check the range error.',
      zh: '在编辑器里把基准场景的“调度”改成“时间调度”并重新载入。应答一次不落，每一轮都解出定位，“响应时隙数”和“尝试次数”两个输入框变灰。请注意唯一变差的那个数：把测距误差与 4 个时隙那一次比一比。' },
  ],
  quiz: [
    {
      q: { en: 'At 4 response slots the six anchors deliver 1.57 ranges a round where the formula predicts 1.42. Why is the run above it?', zh: '在 4 个应答时隙下，六个锚点每轮给出 1.57 次测距，而公式预测 1.42。为什么实测高于它？' },
      options: [
        { en: 'The stronger of two colliding answers gets through', zh: '两路相撞的应答中，较强的一路挤了过去' },
        { en: 'Sit-outs leave fewer than six contending, and at four slots a thinner field wins more slots', zh: '空过使参与竞争的锚点不足六个，而在四个时隙下，场上越稀，赢下的时隙反而越多' },
        { en: 'The phone re-polls the collided slots', zh: '手机把发生碰撞的时隙重新轮询了一遍' },
      ],
      answer: 1,
      explain: { en: 'With four contenders the expectation is 1.69, not 1.42; feeding the measured 5.23 back in gives 1.54 against the run’s 1.57. At the wider windows the same thinning pushes the other way.', zh: '竞争者只有四个时，期望是 1.69 而不是 1.42；把实测的 5.23 代回去得到 1.54，而实测是 1.57。在更宽的窗口里，同样的“变稀”把结果推向另一边。' },
    },
    {
      q: { en: 'Same room, same anchors, same radio: why are the 16-slot window’s ranges three and a half times worse than the 4-slot window’s?', zh: '同一个房间、同样六个锚点、同样的射频：为什么 16 个时隙窗口下的测距误差是 4 个时隙窗口的三点五倍？' },
      options: [
        { en: 'The drawn slot is the reply time, and a single-sided measurement keeps 6.0 cm of 1-σ per slot', zh: '抽到的时隙就是应答时延，而单边测距每个时隙留下 6.0 cm 的 1σ' },
        { en: 'More slots mean more collisions, and a collided timestamp is used anyway', zh: '时隙越多碰撞越多，而碰撞过的时间戳照样会被使用' },
        { en: 'A wider window spreads the transmit power thinner, so the signal-to-noise ratio falls', zh: '更宽的窗口把发射功率摊薄了，于是信噪比下降' },
      ],
      answer: 0,
      explain: { en: 'Drawing slot k means waiting k slots of 2 ms, so 6.0 cm of 1-σ per slot. A wider window has fewer collisions, not more, and the power per frame never changes.', zh: '抽到第 k 个时隙就意味着要等 k 个 2 ms 的时隙，于是每个时隙 6.0 cm 的 1σ。更宽的窗口碰撞是更少而不是更多，而每一帧的功率也从未变过。' },
    },
  ],
}
