/**
 * UWB Tier 2 · M14 · Other ranging modes · One blink per tag.
 *
 * The previous lesson gave the round to the anchors and left the tag listening.
 * This one turns it over again: the badge is the only thing that transmits — one
 * fourteen-octet blink of 181.218 µs per 200 ms block, carrying no times at all —
 * and the anchors are the only things that listen. The reference anchor
 * differences the four arrival stamps and solves the fix, so the position exists
 * on the infrastructure side and never reaches the badge that caused it.
 *
 * The centrepiece is the assumption the mode rests on: that the anchors agree
 * what time it is. One nanosecond of residual calibration error per anchor is
 * 29.98 cm of pseudo-range, and because that error is drawn once and not per
 * round it is a bias — every badge in the room is pushed the same way, and no
 * number of blinks averages it away. The variant sets `syncErrorNs` to 1 and the
 * fixes go from 3.2 cm of mean error to 16.7.
 * Every number quoted below is pinned in tests/course/uwb-ul-tdoa.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbBlink, firstUwbPosition, firstUwbRxTs, firstUwbTdoa, firstUwbUlRound,
  oneRoom, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs: anchors perfectly synchronised, or 1 ns out. */
export type UwbUlTdoaVariant = 'base' | 'sync'

/**
 * The four corner anchors, in the order the infrastructure uses them. The first
 * is the reference: every difference is taken against its arrival stamp, and it
 * is the lane the records are emitted from. The corners and the heights are
 * lesson 5's and lesson 6's, so the two-way fixes and the listen-only fixes
 * measured in this room are the comparison this lesson is entitled to make.
 */
export const UL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — lesson 5's two planes. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/**
 * Where the badges stand: lesson 6's ten spots, so the one thing that differs
 * between the two lessons is which end of the link transmits. None of them is
 * directly under an anchor, where the hyperbolic geometry would be its own story.
 */
export const TAG_SPOTS: { x: number; y: number }[] = [
  { x: 4, y: 3.5 }, { x: 7, y: 6 }, { x: 2, y: 6.5 },
  { x: 5, y: 1 }, { x: 8.5, y: 3 }, { x: 1.5, y: 2.5 }, { x: 6, y: 4.5 },
  { x: 3, y: 1.5 }, { x: 9, y: 7 }, { x: 5.5, y: 7 },
]

/**
 * Four corner anchors and ten blinking badges on a UL-TDoA session with
 * everything else at its default: NLOS on, both noise knobs at their defaults,
 * and every crystal drawn rather than set — which in this mode changes nothing
 * at all, because a blink carries no times and no interval is ever measured on
 * a badge's clock.
 *
 * 'sync' sets `syncErrorNs` to 1 and changes nothing else: each anchor then
 * draws one fixed residual calibration error of that size, once, for the whole
 * session.
 */
export function uwbUlTdoaScenario(variant: UwbUlTdoaVariant = 'base'): Scenario {
  return uwbSc(
    oneRoom(),
    [
      ...UL_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      ...TAG_SPOTS.map((p, i) => uwbTag(`badge-${i + 1}`, `Badge ${i + 1}`, p.x, p.y, TAG_Z)),
    ],
    { mode: 'ul-tdoa', nlos: true, ...(variant === 'sync' ? { syncErrorNs: 1 } : {}) },
  )
}

export const uwbUlTdoa: Lesson = {
  id: 'uwb-ul-tdoa',
  module: 14,
  title: { en: 'One blink per tag', zh: '每个标签一次闪发' },
  body: [
    { text: {
      en: 'One thing here comes from IEEE Std 802.15.4-2024: §10.29.1.2.5 gives time-difference-of-arrival ranging in two forms, and this lesson is the first — a mobile node transmits, fixed nodes whose clocks are synchronised with one another receive it, and the differences between their arrival times place it. The rest is the model: the fourteen octets of the blink and the fact that it carries no times; the anchors’ common timebase, its wired-sync calibration and the fixed residual error each anchor is left with; and every number below.',
      zh: '本课只有一处以 IEEE Std 802.15.4-2024 为依据：§10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第一种——移动节点发送，一组彼此时钟同步的固定节点接收，这些节点到达时刻之差就定出移动节点在哪里。其余都是模型：闪发帧的十四个字节，以及它不携带任何时间这件事；锚点的公共时基、“有线同步”的校准方式，以及每个锚点身上留下的那个固定残差；还有下面引用的每一个数字。',
    } },
    { heading: { en: 'One frame, and then nothing', zh: '一帧，然后什么也没有' }, text: {
      en: 'Lesson 6’s room again: four anchors in the corners of the 10 × 8 m lab at 2.20 m, ten badges at 1.00 m, the same ten spots. Turn the round over once more, and a badge is the only thing that transmits. It owns one slot of 2 ms per 200 ms block and sends one blink in it — fourteen octets, 181.218 µs of air, broadcast, no times at all inside it — then its radio is off until the next block. Over 1.3 s the run holds 70 transmissions, every one of them a blink, 12.685 260 ms of air.',
      zh: '还是第 6 课那个房间：四个锚点位于 10 × 8 m 实验室的四角，高 2.20 m；十个胸牌高 1.00 m，位置也是那十个点。把轮次再翻转一次，于是只有胸牌在发送。它在每个 200 ms 的块里占一个 2 ms 的时隙，在其中发出一帧闪发——十四个字节、181.218 µs 的空口时间、广播、里面一个时间也没有——发完，它的射频就关到下一个块。1.3 s 的运行里一共 70 次发送，每一次都是闪发帧，合计 12.685 260 ms 的空口时间。',
    } },
    { kind: 'table', heading: { en: 'What a badge spends, and what a block holds', zh: '一个胸牌花多少，一个块装得下多少' }, head: [
      { en: 'Quantity', zh: '项目' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'One blink', zh: '一帧闪发' }, N('14 B (9 + 3 + 2), 181.218 µs')],
      [{ en: 'One badge, one block', zh: '一个胸牌，一个块' }, N('1 slot of 2 ms, 1 frame')],
      [{ en: 'Ten badges, one block', zh: '十个胸牌，一个块' }, N('1.812 180 ms, 0.906 %')],
      [{ en: 'The block’s ceiling', zh: '一个块的上限' }, N('100 badges (240 000 ÷ 2 400 RSTU), 9.06 %')],
    ] },
    { heading: { en: 'Positioned by somebody else', zh: '由别人来定位' }, text: {
      en: 'Nothing answers a blink. Every anchor that hears it stamps the arrival on the infrastructure’s common timebase, and when the slot ends anchor 1 — the reference — subtracts its own stamp from each of the other three and solves the hyperbolae. Three time differences and one position leave anchor 1’s lane, and each says whose it is, so the log names the badge and the inspector and the overlay place it there. The badge is told nothing: it has no receiver open here, and not one record travels back to it.',
      zh: '闪发帧没有任何回应。每个听到它的锚点都在基础设施的公共时基上记下到达时刻；时隙结束时，作为参考的 anchor-1 用其余三个时刻各减去自己的那个，再解双曲线。三个时间差与一次定位从 anchor-1 这条泳道发出，而每一条都写明“这是谁的”：日志会点出那个胸牌的名字，检视面板与叠加层则把它放到那个胸牌身上。胸牌自己什么也不会知道：在这个模式里它根本不开接收机，也没有任何一条记录回到它那里。',
    } },
    { kind: 'formula', heading: { en: 'The whole of the arithmetic', zh: '全部的算术' }, text: {
      en: 'arrival_i = t_blink + d(badge, a_i)/c + noise_i + offset_i\nΔ_i = arrival_i − arrival_ref',
      zh: 'arrival_i = t_闪发 + d(胸牌, a_i)/c + noise_i + offset_i\nΔ_i = arrival_i − arrival_参考',
    }, note: {
      en: 'Two instants on one timebase, subtracted — that is all of it. No interval is measured on anybody’s crystal, so this mode has no clock-rate correction and nothing for one to do: t_blink is unknown but identical in both terms, and cancels. Pin all ten badges at either end of the ±20 ppm §16.4.9 allows — the tolerance that cost the previous lesson its centrepiece — and the run comes back the same: every record at the same instant and of the same type, and the same seventy fix errors. The only thing that moves is the counter a badge writes into its own transmit stamp, which nothing here reads. What is left is the receivers’ timestamp noise and the anchors’ calibration offsets.',
      zh: '同一时基上的两个时刻相减——全部就这些。没有任何一段间隔量在谁的晶振上，所以这个模式里根本没有时钟速率修正，也没有什么可修正的：t_闪发 未知，但它在两项里完全相同，一减就没了。§16.4.9 允许胸牌有 ±20 ppm 的晶振偏差，上一课的重头戏都在对付它；而在这里，把十个胸牌都钉到这个容差的两端，整段运行还是原样：每一条记录都在同一时刻、是同一类型，七十次定位的误差也一模一样。唯一会变的，是胸牌写进自己那条发送时间戳里的计数值，而这里没有谁会去读它。剩下的只有接收机的时间戳噪声和锚点的校准偏差。',
    } },
    { heading: { en: 'What one nanosecond buys', zh: '一纳秒值多少' }, text: {
      en: 'Everything now rests on the four anchors agreeing what time it is. One nanosecond is 29.98 cm of pseudo-range, and every difference carries two anchors’ worth of it. The session’s anchor sync error is the 1-σ of that calibration: each anchor draws one fixed residual of that size, once, and the default of 0 ns makes them perfect. The variant sets 1 ns, the four draws come out +0.14, −0.97, −0.34 and −0.31 ns, and badge 1’s difference against anchor 2 then reads about 1.15 ns short — in every round of the run.',
      zh: '于是一切都压在一个假设上：四个锚点对“现在几点”看法一致。1 ns 就是 29.98 cm 的伪距，而每一个时间差里都装着两个锚点的这份误差。会话里的锚点同步误差是这次校准的 1-σ：每个锚点据此一次性抽出一个固定残差，往后不再改变，而默认的 0 ns 意味着锚点是完美的。变体把它设为 1 ns，四次抽样得到 +0.14、−0.97、−0.34 与 −0.31 ns，于是 badge-1 相对 anchor-2 的那个时间差就短了大约 1.15 ns——而且每一轮都短这么多。',
    } },
    { kind: 'table', heading: { en: 'Two scenes, seven blocks, 70 fixes each', zh: '两个场景，各七个块、各 70 次定位' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'σ per difference', zh: '每个时间差的 σ' },
      { en: 'Worst difference', zh: '最差的时间差' }, { en: 'Fix error', zh: '定位误差' },
      { en: 'Error ellipse', zh: '误差椭圆' },
    ], rows: [
      [{ en: 'Perfect sync', zh: '完美同步' }, N('4.2 cm'), N('0.10 m'),
        { en: '0.2–7.7 cm, mean 3.2', zh: '0.2–7.7 cm，平均 3.2' }, N('3.0–4.1 cm')],
      [{ en: '1 ns of sync error', zh: '1 ns 的同步误差' }, N('42.6 cm'), N('0.41 m'),
        { en: '10.4–27.9 cm, mean 16.7', zh: '10.4–27.9 cm，平均 16.7' }, N('30.5–41.5 cm')],
    ] },
    { heading: { en: 'A bias, not noise', zh: '这是偏差，不是噪声' }, text: {
      en: 'That σ is √2·c·√(σ_ts² + sync²), two timestamps and two calibration offsets in one subtraction, and every difference and every fix in both runs lands inside 4σ of it. But the terms differ in kind. Timestamp noise is drawn afresh for every blink; a calibration offset is drawn once and never again, so badge 1’s seven readings against anchor 2 are −1.18, −1.28, −1.16, −1.11, −1.12, −1.18 and −0.99 ns — not once the other way. At 1 ns all ten badges are pushed east, by 12 to 22 cm on average: a distorted map, not a scatter. No number of blinks averages that away; only a better calibration does. The ellipse grows tenfold with it, from the same σ, but it is first-order — a bias is not white noise — so read it as how far the fix may be off, not as a 68 % interval.',
      zh: '那个 σ 是 √2·c·√(σ_ts² + sync²)：一次相减里有两个接收时间戳、两个锚点的校准偏差；两次运行中的每一个时间差、每一次定位都落在它的 4σ 之内。但这两项并不是同一类东西。时间戳噪声每发一帧闪发就重新抽一次；校准偏差却只抽一次、此后再不改变，所以 badge-1 相对 anchor-2 的七次读数是 −1.18、−1.28、−1.16、−1.11、−1.12、−1.18 与 −0.99 ns——一次也没有翻到另一边去。1 ns 时十个胸牌全部被推向东边，平均 12 到 22 cm：这是一张被扭曲的地图，而不是一团散点。发再多闪发也平均不掉它，只有更好的校准才行。椭圆用的是同一个 σ，所以也跟着长大十倍；但它是一阶近似——偏差并不是白噪声——所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。',
    } },
    { heading: { en: 'Blink, or listen', zh: '发一帧，还是只听' }, text: {
      en: 'DL-TDoA puts the fix inside the badge, UL-TDoA inside the infrastructure, and which you want is mostly not a question of accuracy. A listener cannot be counted, because it says nothing, while a blink is a broadcast that names its sender — what an asset tracker wants, and what a person wearing one may not. A listening round costs the anchors 0.505 % of the block whether three badges hear it or three thousand; a blink costs one slot each, and the block runs out at a hundred. What UL buys is the badge: no receiver, no clock-rate correction, no solver — one frame every 200 ms, and somebody else knows where it is.',
      zh: 'DL-TDoA 把定位放在胸牌里，UL-TDoA 放在基础设施里，而选哪一种多半不是精度问题。只听的一方数不出来，因为它什么也不发；而闪发帧是一帧写明了发送者的广播——这正是资产标签想要的，也正是戴着它的人可能不想要的。只听的那一轮，不管是三个胸牌在听还是三千个，锚点都只花掉块的 0.505 %；而闪发是一人一个时隙，一个块到一百个就满了。UL 换来的是胸牌本身：不用接收机、不用时钟速率修正、不用解算器——每 200 ms 一帧，然后自有别人知道它在哪儿。',
    } },
  ],
  scenario: () => uwbUlTdoaScenario('base'),
  variants: [
    { label: { en: '1 ns of sync error', zh: '1 ns 的同步误差' }, scenario: () => uwbUlTdoaScenario('sync') },
  ],
  jumps: [
    J('the round that belongs to one badge', '只属于一个胸牌的那一轮', firstUwbUlRound),
    J('the blink it spends it on', '它在这一轮里发出的闪发帧', firstUwbBlink),
    J('the first anchor to stamp it', '第一个给它打上时间戳的锚点', firstUwbRxTs),
    J('the first time difference', '第一个时间差', firstUwbTdoa),
    J('the fix the infrastructure solves', '基础设施解出的定位', firstUwbPosition),
  ],
  observe: [
    { en: 'At t = 0 badge 1 opens the block’s one round that is its own — “badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs” — and spends it: “badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)”. Its MAC goes to tx at 0 and idle at 181.218 µs, and stays there until 200 ms. Badge 2’s round opens at 2 ms. All 70 TX_START lines in the run belong to a badge.',
      zh: 't = 0 处 badge-1 开启这个块里属于它的那一轮——“badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs”——并把它花掉：“badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)”。它的 MAC 在 0 处进入 tx，181.218 µs 处回到 idle，一直待到 200 ms。badge-2 的那一轮在 2 ms 处开启。整段运行里 70 条 TX_START 全部属于某个胸牌。' },
    { en: 'Follow that blink out into the room: four RX RMARKER lines, at 181.234, 181.237, 181.240 and 181.242 µs — anchor 1, anchor 3, anchor 2, anchor 4, in order of their distance from (4, 3.5). Eight nanoseconds separate the first stamp from the last, and those eight are the whole of what places badge 1.',
      zh: '跟着这帧闪发走进房间：四条 RX RMARKER，分别在 181.234、181.237、181.240 与 181.242 µs——anchor-1、anchor-3、anchor-2、anchor-4，顺序正是它们到 (4, 3.5) 的距离次序。第一个时间戳与最后一个之间相差八纳秒，而定出 badge-1 位置的就只有这八纳秒。' },
    { en: 'At 2.000 000 ms the slot ends and the infrastructure does its arithmetic: “anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)”, then anchor 3 at 2.49 against 2.29 and anchor 4 at 7.19 against 7.15, and then “anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)”. The line says whose it is.',
      zh: '2.000 000 ms 处时隙结束，基础设施开始算账：“anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)”，接着 anchor-3 是 2.49 对 2.29、anchor-4 是 7.19 对 7.15，最后是 “anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)”。这一行会写明它是谁的。' },
    { en: 'Open badge 1 in the inspector. It holds no distances at all: three time differences, whose errors after seven blocks are 0.12, 0.11 and 0.09 ns — all three positive — and a fix 2.1 cm from the truth, GDOP 0.85, error ellipse 3.2 × 1.7 cm, solved from UL-TDoA. Then open anchor 1, which did all of that arithmetic: its own lane is empty.',
      zh: '在检视面板里打开 badge-1。它这里一个距离也没有：三个到达时间差——七个块之后误差是 0.12、0.11 与 0.09 ns，三个都是正的——以及一次定位，偏离真值 2.1 cm，GDOP 0.85，误差椭圆 3.2 × 1.7 cm，解算方式为 UL-TDoA。再打开 anchor-1，这些算术全是它做的：它自己那条泳道空空如也。' },
  ],
  tryThis: [
    { en: 'Load “1 ns of sync error”. Nothing on the air changes — the same 70 blinks, the same 12.685 260 ms — and every fix moves. Badge 1’s three differences now read −0.99, −0.37 and −0.36 ns of error instead of about +0.1, its fix is 12.7 cm out and its ellipse has grown to 32.1 × 16.8 cm. Over all 70 fixes the error runs 10.4 to 27.9 cm against 0.2 to 7.7, a mean of 16.7 against 3.2. Then average each badge’s seven fixes: all ten have moved east, by 12 to 22 cm.',
      zh: '载入“1 ns 的同步误差”。空口上什么也没变——还是 70 帧闪发、还是 12.685 260 ms——可每一次定位都挪了位置。badge-1 的三个时间差误差从大约 +0.1 变成 −0.99、−0.37 与 −0.36 ns，它的定位偏离 12.7 cm，椭圆胀到 32.1 × 16.8 cm。70 次定位整体上误差从 0.2–7.7 cm 变成 10.4–27.9 cm，平均值从 3.2 变成 16.7。再把每个胸牌的七次定位取平均：十个全都往东挪了 12 到 22 cm。' },
    { en: 'In the editor, the anchor sync error field is live in UL-TDoA only. Walk it: 0, 1, 2 and 4 ns give mean errors of 3.2, 16.7, 33.4 and 70.4 cm, and worst cases of 7.7, 27.9, 54.4 and 135.3 — linear in the sigma, once it is clear of the timestamp noise. Then put it back to 1 ns and drag badge 1 out to (9.8, 0.2), outside the anchor rectangle: GDOP goes from 0.85 to 3.43, the ellipse from 32 cm to 1.4 m, and the worst of its seven fixes to 45.3 cm. Geometry multiplies whatever the clocks hand it.',
      zh: '在编辑器里，“锚点同步误差”这一栏只有 UL-TDoA 下才可用。把它走一遍：0、1、2、4 ns 给出的平均误差是 3.2、16.7、33.4 与 70.4 cm，最差值是 7.7、27.9、54.4 与 135.3——只要 σ 明显盖过时间戳噪声，它就是线性的。然后把它调回 1 ns，把 badge-1 拖到 (9.8, 0.2)，即锚点矩形之外：GDOP 从 0.85 变成 3.43，椭圆从 32 cm 涨到 1.4 m，七次定位里最差的一次到 45.3 cm。时钟交出什么，几何都会把它放大。' },
  ],
  quiz: [
    {
      q: { en: 'The previous lesson’s badge had to divide its own crystal out. Why does this badge’s ±20 ppm crystal not matter at all?', zh: '上一课的胸牌必须先把自己的晶振除掉。这一课的胸牌那 ±20 ppm 的晶振为什么完全不要紧？' },
      options: [
        { en: 'A blink is too short for a rate error to show', zh: '闪发帧太短，速率误差显不出来' },
        { en: 'Nothing measures an interval on it: the two instants that get subtracted are both stamped by anchors, on one shared timebase', zh: '没有任何一段间隔量在它上面：相减的那两个时刻都是锚点在同一个共享时基上打的' },
        { en: 'The anchors estimate the badge’s carrier offset and correct for it', zh: '锚点估计出胸牌的载波偏差，并据此做了修正' },
      ],
      answer: 1,
      explain: { en: 'In DL-TDoA the badge subtracts two of its own arrivals, up to 6 ms apart, so its rate error multiplies that gap. Here every timestamp belongs to an anchor, and the badge’s own transmit instant cancels in the difference.', zh: 'DL-TDoA 里胸牌相减的是自己的两个到达时刻，最多相隔 6 ms，速率误差乘在整段间隔上。而这里每一个时间戳都属于锚点，胸牌自己的发送时刻在相减中被消掉了。' },
    },
    {
      q: { en: 'At 1 ns of sync error the fixes are 10 to 28 cm out. Why does blinking ten times as often not help?', zh: '同步误差为 1 ns 时定位偏离 10 到 28 cm。把闪发频率提高十倍，为什么并不管用？' },
      options: [
        { en: 'Each anchor’s calibration error is drawn once and is the same in every round: a bias does not average down', zh: '每个锚点的校准误差只抽一次，此后每一轮都一样：偏差是平均不掉的' },
        { en: 'The extra blinks would collide, and a collision costs more than averaging gains', zh: '多出来的闪发帧会互相碰撞，碰撞的代价超过平均带来的好处' },
        { en: 'The solver keeps only the most recent blink', zh: '解算器只保留最近的一帧闪发' },
      ],
      answer: 0,
      explain: { en: 'Badge 1’s difference against anchor 2 is short by about 1.15 ns in all seven rounds, and all ten badges are pushed the same way. Averaging removes the 4 cm of timestamp noise and leaves the 30 cm the clocks put there.', zh: 'badge-1 相对 anchor-2 的时间差在七轮里每一轮都短约 1.15 ns，十个胸牌也全被推向同一个方向。平均能去掉的是那 4 cm 的时间戳噪声，剩下时钟带来的 30 cm，动不了。' },
    },
    {
      q: { en: 'A warehouse wants four hundred asset tags positioned; a hospital wants badges on people. Which way does each pull?', zh: '一个仓库想给四百个资产标签定位；一家医院想给人身上的胸牌定位。两者各自倾向哪一种？' },
      options: [
        { en: 'Scale pulls towards UL, because the infrastructure does the work there', zh: '规模倾向 UL，因为这个模式里是基础设施在干活' },
        { en: 'Scale pulls towards DL — one round serves however many listen, at 0.505 % of the block, while UL spends a slot per tag and the block holds a hundred — and privacy pulls the same way, since a listener transmits nothing to count', zh: '规模倾向 DL——不管多少个在听都是那一轮，只占块的 0.505 %，而 UL 每个标签要花一个时隙、一个块只装得下一百个；隐私也倾向 DL，因为只听的一方什么也不发，数都数不出来' },
        { en: 'Both pull towards UL, because only UL leaves the fix where an operator can read it', zh: '两者都倾向 UL，因为只有 UL 才把定位留在运营方能读到的地方' },
      ],
      answer: 1,
      explain: { en: 'UL’s argument is the tag, not the count: no receiver, no clock-rate correction, no solver. Four hundred tags need four blocks of slots, or a shorter slot, or a second channel.', zh: 'UL 的理由在标签本身，而不在数量：不用接收机、不用时钟速率修正、不用解算器。四百个标签需要四个块的时隙，或者更短的时隙，或者再开一个信道。' },
    },
  ],
}
