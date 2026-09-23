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
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The drawn
 * offsets, the sync-error walk and the geometry are in `deeper`; the clause and
 * the model choices are in `sources`. Every number quoted below is pinned in
 * tests/course/uwb-ul-tdoa.test.ts; `npx tsx scripts/lesson-dump.ts uwb-ul-tdoa
 * en` prints the section budgets.
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
 * `uwb-position`'s and `uwb-dl-tdoa`'s, so the two-way fixes and the listen-only
 * fixes measured in this room are the comparison this lesson may make.
 */
export const UL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — `uwb-position`'s two planes. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/**
 * Where the badges stand: `uwb-dl-tdoa`'s ten spots, so the one thing that
 * differs between the two lessons is which end of the link transmits. None of
 * them is directly under an anchor, where the hyperbolic geometry would be its
 * own story.
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
  why: {
    en: 'A tag — anything being located — that listens still needs a receiver, a clock of its own and a solver to run. A badge on a hospital lanyard would rather have none of those, and the people who fitted the building would rather read every badge’s place off a screen than ask each badge in turn. So flip the link once more: the tag speaks, and the building listens.',
    zh: '只听的标签（被定位的那一端就叫标签），仍然要有接收机、要有自己的钟、还要跑一套解算。挂在医院工牌带上的胸牌，这三样一个都不想要；而给这栋楼布网的人，也宁愿在屏幕上直接读出每个胸牌在哪儿，而不是挨个去问。那就把这条链路再翻一次：标签说话，楼来听。',
  },
  outcomes: [
    { en: 'say what one short frame costs a tag and what it buys the building', zh: '说清一帧短短的信号，标签付出什么，楼里换来什么' },
    { en: 'explain why this tag’s crystal does not matter at all', zh: '解释这里标签的晶振为什么完全不要紧' },
    { en: 'tell a calibration bias (an error drawn once and then repeated) from noise by the way the fixes move', zh: '从定位挪动的方式，把校准偏差（只抽一次、此后重复出现的误差）和噪声区分开' },
  ],
  needs: ['uwb-dl-tdoa'],
  terms: [
    { term: 'blink', plain: {
      en: 'the one short frame a tag sends and forgets: no times inside it, and no answer expected',
      zh: '标签发完就不管的那一帧短信号：里面没有任何时间，也不等谁回话',
    } },
    { term: 'UL-TDoA', plain: {
      en: 'the uplink form: the tag transmits, and the anchors’ shared clock does everything else',
      zh: '上行形态：发送的是标签，其余全交给锚点那只共享的钟',
    } },
    { term: 'sync error', plain: {
      en: 'how far apart the anchors’ clocks still are once they have been calibrated against each other',
      zh: '锚点彼此校准过之后，它们的钟实际上还差多少',
    } },
    { term: 'bias', plain: {
      en: 'an error drawn once and then repeated in every round, which averaging cannot remove',
      zh: '只抽一次、此后每一轮都照样出现的误差，平均是去不掉的',
    } },
  ],
  picture: [
    { heading: { en: 'One frame, and then nothing', zh: '一帧，然后什么也没有' }, text: {
      en: 'The same room as the lesson before: anchors in the corners, badges at chest height. Turn the round over once more and a badge is the only thing that transmits. It owns one slot per block and spends it on a blink — a short broadcast with no times inside it — then its radio is off until the next block.',
      zh: '还是上一课那个房间：锚点在四角，胸牌在胸口高度。把轮次再翻一次，于是只有胸牌在发送。它每个块占一个时隙，用来发一帧闪发（blink）——一小段广播，里面没有任何时间——发完，它的射频就关到下一个块。',
    } },
    { heading: { en: 'Positioned by somebody else', zh: '由别人来定位' }, text: {
      en: 'Nothing answers a blink. Every anchor that hears it stamps the arrival on the timebase they all share, and when the slot ends the reference anchor subtracts its own stamp from each of the other three and solves the same hyperbolae as before. This uplink form is called UL-TDoA, and it tells the badge nothing: it has no receiver open, and not one record travels back to it.',
      zh: '闪发帧没有任何回应。每个听到它的锚点，都在大家共用的那条时基上记下到达时刻；时隙结束时，参考锚点用其余三个时刻各减去自己的那个，再解出和上一课一样的双曲线。这种上行形态就是 UL-TDoA，它什么也不告诉胸牌：它根本没开接收机，也没有任何一条记录回到它那里。',
    } },
    { kind: 'watch', jump: 4, heading: { en: 'Watch it happen to someone else', zh: '看它发生在别人身上' }, text: {
      en: 'Load the simulation and jump to the fix. It leaves the reference anchor’s lane, not the badge’s, and the line names the badge it is about.',
      zh: '载入仿真，跳到那次定位。它是从参考锚点那条泳道发出的，不是胸牌那条；而这一行会写明它说的是哪个胸牌。',
    } },
    { heading: { en: 'Its crystal stops mattering', zh: '它的晶振不再要紧' }, text: {
      en: 'Two instants on one timebase, subtracted — that is the whole of the arithmetic. No interval is measured on the badge’s crystal, so there is no clock rate to correct and nothing for a correction to do. The instant the blink left is unknown, but it is the same in both terms, and it cancels. All that survives is the receivers.',
      zh: '同一条时基上的两个时刻相减——全部算术就这些。没有任何一段间隔量在胸牌的晶振上，所以既没有时钟速率要修正，也没有什么可供修正。闪发离开的那一刻是未知的，但它在两项里完全相同，一减就没了。最后剩下的只有接收端那一侧。',
    } },
    { heading: { en: 'Everything rests on the anchors agreeing', zh: '一切都压在锚点的共识上' }, text: {
      en: 'So the whole mode rests on four anchors agreeing what time it is. They are calibrated against each other, and what is left over afterwards is the sync error. A nanosecond of it is about a third of a metre, and the session lets you dial it.',
      zh: '于是整个模式如今都压在一件事上：四个锚点对“现在几点”看法一致。它们彼此做过校准，校准之后剩下的那点差距，就是同步误差（sync error）。一纳秒的同步误差约合三分之一米，而每个时间差里都装着两个锚点的份额；这个量在会话里可以自己调。',
    } },
    { heading: { en: 'A bias, not noise', zh: '这是偏差，不是噪声' }, text: {
      en: 'The two error terms differ in kind. Timestamp noise is drawn afresh for every blink, so it scatters and averages down. A calibration offset is drawn once and never again: it is a bias, the same in every round, pushing every badge in the room the same way. A distorted map, not a scatter, and only a better calibration mends it.',
      zh: '这里的两项误差并不是同一类东西。时间戳噪声每发一帧闪发就重新抽一次，所以它是散的，平均得掉。而校准偏差只抽一次、此后再不改变：它是偏差（bias），每一轮都一样，并且把房间里的每个胸牌都朝同一个方向推。那是一张被扭曲的地图，而不是一团散点，只有把校准做好才治得了。',
    } },
    { heading: { en: 'Blink, or listen', zh: '发一帧，还是只听' }, text: {
      en: 'Which way round you want is mostly not a question of accuracy. A listener cannot be counted, because it says nothing, while a blink is a broadcast that names its sender — what an asset tracker wants, and what a person wearing one may not. A listening round serves any number at once; a blink costs a slot each, and slots run out.',
      zh: '到底要哪一种，多半不是精度问题。只听的一方数不出来，因为它什么也不发；而闪发帧是一帧写明了发送者的广播——这正是资产标签想要的，也正是戴着它的人可能不想要的。只听的那一轮，多少个胸牌都能一起伺候；而闪发是一人一个时隙，而一个块的时隙是会用完的。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'What a badge spends, and what a block holds', zh: '一个胸牌花多少，一个块装得下多少' }, head: [
      { en: 'Quantity', zh: '项目' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'One blink', zh: '一帧闪发' }, N('14 B (9 + 3 + 2), 181.218 µs')],
      [{ en: 'One badge, one block', zh: '一个胸牌，一个块' }, { en: '1 slot of 2 ms, 1 frame', zh: '1 个 2 ms 时隙，1 帧' }],
      [{ en: 'Ten badges, one block', zh: '十个胸牌，一个块' }, N('1.812 180 ms, 0.906 %')],
      [{ en: 'The block’s ceiling', zh: '一个块的上限' }, N('100 badges (240 000 ÷ 2 400 RSTU), 9.06 %')],
    ] },
    { kind: 'formula', heading: { en: 'The whole of the arithmetic', zh: '全部的算术' }, text: {
      en: 'arrival_i = t_blink + d(badge, a_i)/c + noise_i + offset_i\nΔ_i = arrival_i − arrival_ref',
      zh: 'arrival_i = t_闪发 + d(胸牌, a_i)/c + noise_i + offset_i\nΔ_i = arrival_i − arrival_参考',
    }, note: {
      en: 'The transmit instant t_blink is unknown but identical in both terms, and cancels. Pin all ten badges at either end of the crystal tolerance and the run comes back the same: every record at the same instant and of the same type, and the same seventy fix errors. The only thing that moves is the counter a badge writes into its own transmit stamp, which nothing here reads.',
      zh: '发送时刻 t_闪发 未知，但它在两项里完全相同，一减即消。把十个胸牌全部钉到晶振容差的两端，整段运行依旧原样：每一条记录都在同一时刻、是同一类型，七十次定位的误差也一模一样。唯一会变的，是胸牌写进自己那条发送时间戳里的计数值，而这里没有谁会去读它。',
    } },
    { text: {
      en: 'One nanosecond is 29.98 cm of pseudo-range, and every difference carries two anchors’ worth of it; the default of 0 ns makes the anchors perfect, and the variant sets 1 ns.',
      zh: '1 ns 就是 29.98 cm 的伪距，而每个时间差里都装着两个锚点的份额；默认的 0 ns 意味着锚点完美无缺，而变体把它设成 1 ns。',
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
    { text: {
      en: 'That σ is √2·c·√(σ_ts² + sync²): two timestamps and two calibration offsets in one subtraction. Every difference and every fix of both runs lands inside 4σ of it, and the ellipse is drawn from the same figure — which is why it grows tenfold between the rows.',
      zh: '那个 σ 是 √2·c·√(σ_ts² + sync²)：一次相减里有两个时间戳、两个锚点的校准偏差。两次运行中的每一个时间差、每一次定位，都落在它的 4σ 之内；椭圆也是照这个数画的——所以两行之间它长大了十倍。',
    } },
    { kind: 'table', heading: { en: 'What the log prints, badge 1, block 0', zh: '日志印出什么：badge-1，第 0 块' }, head: [
      { en: 'Line', zh: '行' }, { en: 'It reads', zh: '写的是' },
    ], rows: [
      [{ en: 'The round that is the badge’s own', zh: '属于这个胸牌的那一轮' },
        N('badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs')],
      [{ en: 'The blink it spends it on', zh: '它用掉这一轮发出的闪发' },
        N('badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)')],
      [{ en: 'The first time difference', zh: '第一个时间差' },
        N('anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)')],
      [{ en: 'The place it feeds', zh: '它喂出来的那个位置' },
        N('anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)')],
      [{ en: 'Badge 1 after seven blocks', zh: '七个块之后的 badge-1' },
        N('error 2.1 cm, GDOP 0.85, ellipse 3.2 × 1.7 cm, UL-TDoA')],
    ] },
    { kind: 'steps', heading: { en: 'One fix, step by step', zh: '一次定位，一步一步' }, items: [
      { en: 'The session hands badge-1 one slot of the block and nothing else. It sends one blink, then its radio is off until the next block. Nothing answers it.',
        zh: '会话只给 badge-1 一个时隙，别的什么也没有。它发出一帧闪发，射频就关到下一个块。没有任何回应，也没有任何一条记录回到它这里。' },
      { en: 'Every anchor that hears the blink stamps its RMARKER and writes a counter on its own crystal for the log — the UWB_TS line. The fix is not built from that counter.',
        zh: '听到这帧闪发的每个锚点，都给它的 RMARKER 打戳。它会用自己的晶振写下一个计数值供日志显示——就是你能读到的那行 UWB_TS——但定位并不是用这个计数值算的。' },
      { en: 'What the fix uses is the arrival on the anchors’ shared timebase: true flight, plus this receiver’s timestamp noise, plus this anchor’s residual calibration error. Wired sync already removed its crystal.',
        zh: '定位用的是锚点公共时基上的那个到达时刻：真实飞行时间，加上这台接收机的时间戳噪声，再加上这个锚点自己的校准残差。有线同步已经把它的晶振除掉了。' },
      { en: 'That residual was drawn once, when the network was built, from the session’s sync error — 0 ns here, 1 ns in the variant — and never again. Hence a bias, not noise.',
        zh: '那个残差只在建网时按会话的同步误差抽过一次——本场景是 0 ns，变体里是 1 ns——此后再不重抽。这正是它是偏差而不是噪声的原因。' },
      { en: 'When the slot closes the network collects the four arrivals and hands them to anchor-1, the reference. An anchor that missed the blink is left out; if anchor-1 missed it, nothing is produced.',
        zh: '时隙结束时，网络把四个到达时刻收齐，交给参考锚点 anchor-1。没听到闪发的锚点直接不算；而如果 anchor-1 自己没听到，这一轮就什么也不产出。' },
      { en: 'anchor-1 subtracts its own arrival from each of the other three. No rate needs correcting: no interval was measured on anybody’s crystal, and the unknown instant the blink left cancels.',
        zh: 'anchor-1 用其余三个到达时刻各减去自己的那个。这里没有速率要修正：没有任何一段间隔量在谁的晶振上，而闪发离开的那个未知时刻同时出现在两项里，一减即消。' },
      { en: 'Three UWB_TDOA lines, each naming the badge, become three hyperbolae. The solver crosses them at the badge’s configured height, with one σ for all three, and emits the position line from anchor-1’s lane.',
        zh: '三行 UWB_TDOA——每一行都写明它说的是哪个胸牌——就是三条双曲线。解算器在胸牌预设的高度上把它们相交，三条共用同一个 σ，再从 anchor-1 那条泳道发出那一行定位。' },
    ] },
    { kind: 'table', heading: { en: 'badge-1, block 0, against anchor-2', zh: 'badge-1，第 0 块，对 anchor-2' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'the blink leaves badge-1', zh: '闪发离开 badge-1' },
        { en: 'unknown, and the same in both terms', zh: '未知，而且在两项里完全相同' }],
      [{ en: 'true flight to anchor-1', zh: '到 anchor-1 的真实飞行' }, N('4.7634 m · 15.889 ns')],
      [{ en: 'true flight to anchor-2', zh: '到 anchor-2 的真实飞行' }, N('6.3789 m · 21.278 ns')],
      [{ en: 'the difference the geometry holds', zh: '几何本身给出的那个差' }, N('5.3886 ns · 1.6155 m')],
      [{ en: 'each anchor’s calibration residual', zh: '每个锚点的校准残差' }, N('0 ns')],
      [{ en: 'what anchor-1 differences', zh: 'anchor-1 相减得到的' }, N('5.3267 ns')],
      [{ en: 'left over: two receivers’ noise', zh: '残差：两台接收机的噪声' }, N('−0.0619 ns · −1.86 cm')],
      [{ en: 'σ of one difference', zh: '一个时间差的 σ' }, N('√2·c·√(0.1² + 0²) ns = 4.2 cm')],
      [{ en: 'the fix it feeds', zh: '它喂出来的那次定位' }, N('(4.02, 3.46) m, true (4.00, 3.50), error 0.05 m')],
    ] },
  ],
  deeper: [
    { heading: { en: 'The offsets this scene drew', zh: '本场景抽到的那些偏差' }, text: {
      en: 'At 1 ns the four draws come out +0.14, −0.97, −0.34 and −0.31 ns, so badge 1’s difference against anchor 2 reads about 1.15 ns short — in every round of the run. Its seven readings are −1.18, −1.28, −1.16, −1.11, −1.12, −1.18 and −0.99 ns, not once the other way, and its own fix is 12.7 cm out where the synchronised run had it 2.1. Average each badge’s seven fixes and all ten have moved east, by 12 to 22 cm. No number of blinks averages that away; only a better calibration does.',
      zh: '在 1 ns 下，四次抽样得到 +0.14、−0.97、−0.34 与 −0.31 ns，于是 badge-1 相对 anchor-2 的时间差短了大约 1.15 ns——而且每一轮都短这么多。它的七次读数是 −1.18、−1.28、−1.16、−1.11、−1.12、−1.18 与 −0.99 ns，一次也没有翻到另一边去；它自己的定位偏了 12.7 cm，而同步完好的那次只偏 2.1 cm。把每个胸牌的七次定位取平均，十个全都往东挪了 12 到 22 cm。发再多闪发也平均不掉它，只有更好的校准才行。',
    } },
    { heading: { en: 'Walking the knob, and then the geometry', zh: '把旋钮走一遍，再走一遍几何' }, text: {
      en: 'The editor’s anchor sync error field is live in UL-TDoA only. Walked, it is linear in the sigma once it is clear of the timestamp noise. Then put it back to 1 ns and drag badge 1 out to (9.8, 0.2), outside the anchor rectangle: GDOP goes from 0.85 to 3.43, the ellipse from 32 cm to 1.4 m, and the worst of its seven fixes to 45.3 cm. Geometry multiplies whatever the clocks hand it.',
      zh: '编辑器里的“锚点同步误差”一栏，只有 UL-TDoA 下才可用。把它走一遍会看到：只要 σ 明显盖过时间戳噪声，它就是线性的。然后把它调回 1 ns，再把 badge-1 拖到 (9.8, 0.2)，即锚点矩形之外：GDOP 从 0.85 变成 3.43，椭圆从 32 cm 涨到 1.4 m，七次定位里最差的一次到 45.3 cm。时钟交出什么，几何都会把它放大。',
    } },
    { kind: 'table', heading: { en: 'The sync-error walk', zh: '同步误差走一遍' }, head: [
      { en: 'Sync error', zh: '同步误差' }, { en: 'Mean fix error', zh: '平均定位误差' }, { en: 'Worst of 70', zh: '70 次里最差' },
    ], rows: [
      [N('0 ns'), N('3.2 cm'), N('7.7 cm')],
      [N('1 ns'), N('16.7 cm'), N('27.9 cm')],
      [N('2 ns'), N('33.4 cm'), N('54.4 cm')],
      [N('4 ns'), N('70.4 cm'), N('135.3 cm')],
    ] },
    { heading: { en: 'How honest the ellipse is', zh: '那个椭圆有多诚实' }, text: {
      en: 'It is first-order, and a bias is not white noise, so read it as how far the fix may be off, not as a 68 % interval. In both scenes the semi-major axis is at least half the worst of the seventy errors and never more than a few times it, which is about as much as a first-order figure can promise.',
      zh: '它是一阶近似，而偏差并不是白噪声，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。两个场景里，长半轴至少有那七十次中最差误差的一半，最多也不过是它的几倍——一阶的数字，能许诺的大概也就这么多。',
    } },
    { heading: { en: 'What each way costs the air', zh: '两条路各占多少空口' }, text: {
      en: 'A listening round costs the anchors 0.505 % of the block whether three badges hear it or three thousand; ten blinking badges spend 12.685 260 ms of air over seven blocks, one slot each, and the block runs out at a hundred. Four hundred tags therefore need four blocks of slots, or a shorter slot, or a second channel. What the uplink form buys is the badge itself: no receiver, no clock-rate correction, no solver.',
      zh: '只听的那一轮，不管是三个胸牌在听还是三千个，锚点都只花掉块的 0.505 %；而十个闪发的胸牌，七个块里要花掉 12.685 260 ms 的空口时间，一人一个时隙，一个块到一百个就满了。所以四百个标签需要四个块的时隙，或者更短的时隙，或者再开一个信道。上行形态换来的是胸牌本身：不用接收机、不用时钟速率修正、不用解算器。',
    } },
  ],
  sources: [
    { en: 'One thing here is the standard’s: IEEE Std 802.15.4-2024 §10.29.1.2.5 gives time-difference-of-arrival ranging in two forms, and this lesson is the first — a mobile node transmits, fixed nodes whose clocks are synchronised with one another receive it, and the differences between their arrival times place it. The ±20 ppm crystal tolerance the note above pins the badges at is §16.4.9.',
      zh: '本课只有一处以标准正文为依据：IEEE Std 802.15.4-2024 §10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第一种——移动节点发送，一组彼此时钟同步的固定节点接收，这些节点到达时刻之差就定出它在哪里。上面那条注释里把胸牌钉到的 ±20 ppm 晶振容差，出自 §16.4.9。' },
    { en: 'The rest is the model: the fourteen octets of the blink and the fact that it carries no times; the 2 ms slot it is sent in; the anchors’ common timebase, its wired-sync calibration and the fixed residual error each anchor is left with; and every number quoted above.',
      zh: '其余都是模型：闪发帧的十四个字节，以及它不携带任何时间这件事；发送它的那个 2 ms 时隙；锚点的公共时基、“有线同步”的校准方式，以及每个锚点身上留下的那个固定残差；还有上面引用的每一个数字。' },
    { en: 'The noise figures are model choices too: 100 ps of 1-σ noise on every received timestamp, and a sync error of 0 ns by default, which is a laboratory’s answer and no installation’s. The anchors’ own positions are treated as surveyed exactly.',
      zh: '噪声取值同样是模型取值：每个接收时间戳上 100 ps 的 1σ 噪声；同步误差默认取 0 ns，那是实验室的答案，不是任何一次真实安装的答案。锚点自身的坐标同样被当作勘测得分毫不差。' },
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
    { en: 'A badge opens the one round of the block that is its own, spends it on a single blink, then goes idle until the next block. Every transmission in the run is a badge’s — seventy in all.',
      zh: 'badge-1 开启这个块里属于它的那一轮，用掉它发出一帧闪发，然后就闲到下一个块。整段运行里每一次发送都属于某个胸牌——一共七十次，每个胸牌每块一次。' },
    { en: 'Follow that blink into the room: four arrival stamps, at 181.234, 181.237, 181.240 and 181.242 µs, in order of each anchor’s distance from the badge. Eight nanoseconds end to end, and that is all there is.',
      zh: '跟着这帧闪发走进房间：四个到达时间戳，分别在 181.234、181.237、181.240 与 181.242 µs，顺序正是各锚点到胸牌的距离次序。首尾相差八纳秒，而定出它位置的，就只有这八纳秒。' },
    { en: 'Open a badge in the inspector: no distances, three time differences and a fix, all solved elsewhere. Then open the reference anchor that did the arithmetic — its lane is empty.',
      zh: '在检视面板里打开 badge-1：没有距离，只有三个到达时间差和一次定位，而它们都是在别处算出来的。再打开参考锚点——这些算术全是它做的，它自己那条泳道却空空如也。' },
  ],
  tryThis: [
    { en: 'Load “1 ns of sync error”. Nothing on the air changes — the same blinks, the same airtime — and every fix moves. The middle badge’s ellipse grows to 32.1 × 16.8 cm, and over the seventy fixes the mean error goes from 3.2 cm to 16.7.',
      zh: '载入“1 ns 的同步误差”。空口上什么也没变——还是那些闪发、还是那些空口时间——可每一次定位都挪了位置。房间中部那个胸牌的椭圆胀到 32.1 × 16.8 cm；七十次定位的平均误差，从 3.2 cm 变成 16.7。' },
    { en: 'In the editor, walk the anchor sync error through 0, 1, 2 and 4 ns, reading the mean fix error. It quadruples over the first step, then doubles with the sigma: the clocks, not the radio, are what a fix is made of.',
      zh: '在编辑器里把锚点同步误差依次走过 0、1、2、4 ns，每次读一下平均定位误差。第一步到第二步它翻了四倍，之后就随 σ 成倍增长：定位到底由什么构成，答案是时钟，不是射频。' },
  ],
  quiz: [
    {
      q: { en: 'The listening badge divided its own crystal out. Why does this one’s not matter?', zh: '上一课只听的胸牌必须把自己的晶振除掉。这一课的为什么不要紧？' },
      options: [
        { en: 'A blink is too short for a rate error', zh: '闪发帧太短，速率误差显不出来' },
        { en: 'Nothing measures an interval on it: both instants subtracted are stamped by anchors', zh: '没有任何一段间隔量在它上面：相减的两个时刻都是锚点打的' },
        { en: 'The anchors estimate its carrier offset and correct for it', zh: '锚点估计出它的载波偏差并做了修正' },
      ],
      answer: 1,
      explain: { en: 'There it subtracted two of its own arrivals. Here every stamp belongs to an anchor, and the transmit instant cancels.', zh: '那里胸牌相减的是自己的两个到达时刻。这里每个时间戳都属于锚点，而胸牌的发送时刻被减没了。' },
    },
    {
      q: { en: 'Why does blinking more often not mend a decimetre of sync error?', zh: '一分米的同步误差，发得更勤为什么补不回来？' },
      options: [
        { en: 'Each anchor’s calibration error is drawn once and repeats: a bias does not average down', zh: '每个锚点的校准误差只抽一次、此后重复出现：偏差是平均不掉的' },
        { en: 'The extra blinks would collide', zh: '多出来的闪发会互相碰撞' },
        { en: 'The solver keeps only the most recent blink', zh: '解算器只保留最近的一帧闪发' },
      ],
      answer: 0,
      explain: { en: 'Every round is short by the same amount, and all ten badges move alike. Averaging removes the timestamp noise and leaves the clocks.', zh: '每一轮短的量都一样，十个胸牌也朝同一方向挪。平均去掉的是时间戳噪声，剩下的是时钟。' },
    },
    {
      q: { en: 'A warehouse wants four hundred tags placed; a hospital, badges on people. Which way does each pull?', zh: '仓库想给四百个标签定位，医院想给人身上的胸牌定位。两者各自倾向哪一种？' },
      options: [
        { en: 'Both pull uplink: only it hands the place to an operator', zh: '两者都倾向上行：只有它把位置留在运营方能读到的地方' },
        { en: 'Both pull the other way: one round serves any number, and a listener cannot be counted', zh: '两者都倾向另一边：只听的那一轮多少个都能服务，而只听的一方数都数不出来' },
        { en: 'Scale pulls uplink, because the infrastructure works there', zh: '规模倾向上行，因为那边是基础设施在干活' },
      ],
      answer: 1,
      explain: { en: 'The uplink argument is the tag, not the count: no receiver, no correction, no solver. Four hundred tags need four blocks of slots.', zh: '上行的理由在标签本身，而不在数量：不用接收机、不用时钟速率修正、不用解算器。四百个标签需要四个块的时隙。' },
    },
  ],
}
