/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Sixteen milliseconds of energy.
 *
 * The first lesson of the 802.15.4ab tier, and the first that is mostly draft
 * rather than standard. Its room is built so that one 4z frame cannot cross it:
 * a 22 m hall cut into three bays by two full-height brick partitions, three
 * anchors in the first bay and one tag in the third, 13 m and 24 dB away. Every
 * fragment of every train lands at −100.26 dBm, seven decibels under the
 * receiver's own sensitivity, and nothing but the train rescues it.
 *
 * This is the picture half of the old lesson: why one frame cannot cross that
 * room, why a longer one would not help, what a fragment is, how a receiver
 * that cannot hear one adds up eight of them, and what the narrowband radio
 * beside it carries meanwhile. The arithmetic — the millisecond's energy
 * budget, the combining gains, the three decibels between four fragments and
 * eight, the clock ratio a train measures, and the honest share of the
 * 19.57 dB a train beats a 4z Poll by — is the second half, `uwb-mms-numbers`,
 * which loads exactly this scene and these variants, so the split adds no new
 * scenario and the recorded hashes of the two ids are equal.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). Every
 * number quoted below is pinned in tests/course/uwb-mms.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-mms en` prints the section budgets.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import { mmsSet } from '../../uwb/mms'
import {
  J, N, anchor, firstNbPoll, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain,
  twoWallLab, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/**
 * Which scene the lesson runs: the draft's own ranging-cycle default (X = 8), the same cycle
 * with half the train, one of the mandatory parameter sets (X = 16 on a shorter fragment), or
 * ordinary 4z two-way ranging in the same room.
 */
export type UwbMmsVariant = 'base' | 'four' | 'rsf1' | 'twr'

/**
 * The three anchors, all in the first bay of the hall and all behind both brick partitions
 * from the tag. They are placed so that the three of them are as nearly equidistant as the bay
 * allows — 13.04, 13.04 and 12.76 m — because the lesson's whole subject is one threshold: at
 * X = 4 every one of the three has to fail, and at X = 8 every one has to succeed. An anchor
 * in the middle of the bay would be 8.58 m away, three and a half decibels louder, and would
 * range on four fragments while the other two ranged on none.
 *
 * Each crystal is set rather than drawn, so the ratio the trains measure has a known truth to
 * be checked against: the tag at +20 ppm and the anchors at −20, 0 and +10 give ratios of 40,
 * 20 and 10 ppm at the tag.
 */
export const MMS_ANCHORS: { id: string; name: string; x: number; y: number; ppm: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5, ppm: -20 },
  { id: 'anchor-2', name: 'Anchor 2', x: 0.5, y: 7.5, ppm: 0 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.3, y: 4.0, ppm: 10 },
]
/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The tag, in the third bay: 12.5 m and two brick walls from the nearest anchor. */
export const TAG_POS = { x: 13.0, y: 4.0, ppm: 20 }

/**
 * Three anchors and one tag on an MMS session, on the 600 RSTU (0.5 ms) slot the draft's
 * §1.1.1 asks for and the simulator's own 200 ms block. `report: 'responder'` puts the range
 * on the tag's lane, where the block fix needs it; `nbChannels: [3]` is the draft's default
 * control channel, in UNII-3, where there is no Wi-Fi in this room to share with and listen
 * before talk is not required. NLOS is on, and the two brick walls charge for it.
 */
export function uwbMmsScenario(variant: UwbMmsVariant = 'base'): Scenario {
  const phy = variant === 'four' ? { rsfs: 4 as const } : variant === 'rsf1' ? mmsSet('rsf-1') : {}
  return uwbSc(
    twoWallLab(),
    [
      ...MMS_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z, a.ppm)),
      uwbTag('tag-1', 'Tag', TAG_POS.x, TAG_POS.y, TAG_Z, TAG_POS.ppm),
    ],
    variant === 'twr'
      ? { mode: 'twr', method: 'ss', slotRstu: 600, aoa: false, nlos: true }
      : {
        mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true,
        mms: { ...DEFAULT_UWB_SESSION.mms, ...phy, nbChannels: [3], report: 'responder' },
      },
  )
}

export const uwbMms: Lesson = {
  id: 'uwb-mms',
  module: 15,
  title: { en: 'Sixteen milliseconds of energy', zh: '十六毫秒的能量' },
  why: {
    en: 'Take the same tag and the same anchors and put two brick walls between them. Every ranging frame still arrives — it just arrives quieter than the receiver can hear, so nothing is measured at all. This lesson is the trick that gets the measurement anyway: instead of one frame, send a train of short ones spread over many milliseconds, and let the far end add them up.',
    zh: '把同样的标签和同样的锚点摆好，中间隔上两道砖墙。每一帧测距帧其实都到了——只是到达时比接收机能听见的还轻，于是什么也量不出来。这一课讲的就是仍然把测量做成的那个办法：不发一帧，改发一串短的、摊在好几毫秒里的片段，让对端把它们加起来。',
  },
  outcomes: [
    { en: 'say why a longer frame does not help and a train of short ones does', zh: '说清为什么把帧拉长没用，而一串短片段管用' },
    { en: 'follow one round from its narrowband opening to the range at the end', zh: '把一轮从窄带开场一路跟到末尾那次测距' },
    { en: 'say which parts of a round carry timing and which carry words', zh: '说出一轮里哪些部分承载时间、哪些承载话语' },
  ],
  needs: ['uwb-blocks', 'uwb-dstwr'],
  terms: [
    { term: 'MMS', plain: {
      en: 'multi-millisecond: one ranging packet spread over many milliseconds, not sent in one go',
      zh: '多毫秒：把一个测距分组摊到好几毫秒里发，而不是一次发完',
    } },
    { term: 'fragment', plain: {
      en: 'one millisecond’s piece of that packet, sent on its own and added in later',
      zh: '这个分组在某一毫秒里的那一片，单独发出，事后再累加进来',
    } },
    { term: 'RSF', plain: {
      en: 'ranging sequence fragment: a fragment carrying nothing but the sequence a timestamp comes from',
      zh: '测距序列片段：里面除了用来取时间戳的那段序列，什么也不装',
    } },
    { term: 'RIF', plain: {
      en: 'ranging integrity fragment: an optional extra that checks a result — this scene sends none',
      zh: '测距完整性片段：用来校验结果的可选附加片段——本场景一个也不发',
    } },
  ],
  picture: [
    { heading: { en: 'A room one frame cannot cross', zh: '一个帧过不去的房间' }, text: {
      en: 'The scene is a long hall cut into three bays by two full-height brick partitions. Three anchors stand in the first bay and one tag in the third, so every ray between them crosses both walls. The frames still arrive — the room is not that big — but they arrive below what the receiver can detect, and a receiver that cannot detect a frame cannot timestamp it either.',
      zh: '场景是一条长厅，被两道通顶砖墙切成三个隔间。三个锚点立在第一个隔间里，一个标签在第三个隔间里，于是它们之间的每一条射线都要穿过两道墙。帧还是照样到达——房间没那么大——只是到达时比接收机能检出的门限低了好几分贝；而检不出一帧，也就没法给它打时间戳。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'Watch a train be judged', zh: '看一串片段被判定' }, text: {
      en: 'Load the simulation and jump to the verdict on the first train. One line says how many fragments were heard, how loud each was, what they added up to, and whether that cleared the receiver. Everything here is in that line.',
      zh: '载入仿真，跳到对第一串片段的判定。一行字写着收到了几个片段、每个多响、加起来是多少，以及这有没有越过接收机的门限。本课要讲的一切都在这一行里。',
    } },
    { heading: { en: 'The energy is there; the moment is not', zh: '能量是有的，只是不在同一瞬间' }, text: {
      en: 'The obvious answer — shout — is not available. What the regulator caps is not a total but an average taken over each millisecond, so no single moment may be made louder. What it does not cap is how many milliseconds you use: a transmitter that spends this millisecond’s allowance, then the next, then the next, is as legal as one that spends a single millisecond and stops.',
      zh: '最顺手的办法——喊得更响——用不了。法规限住的不是总量，而是在每一毫秒上取的平均，所以任何单独的一瞬都不能更响。它没有限住的，是你用掉多少个毫秒。一台把这一毫秒的额度花掉、再花下一毫秒、再花下一毫秒的发射机，和一台只花一毫秒就收手的，同样合规。',
    } },
    { heading: { en: 'One fragment, then another', zh: '一个片段，再来一个' }, text: {
      en: 'So the packet is broken up. A fragment is one millisecond’s piece of it, and it is stripped to the bone: no preamble to search for, no header, no address, no data — only the sequence a timestamp is taken from, which is why it is called a ranging sequence fragment, RSF. One goes out every millisecond, and the pair interleave, each using the gaps in the other’s train.',
      zh: '于是把这个分组拆开。一个片段就是其中一毫秒的那一片，而且被剥得只剩骨头：没有要搜索的前导、没有头、没有地址、没有数据——只有用来取时间戳的那段序列，所以它叫测距序列片段，RSF。每毫秒发出一个，而配对的两端交错发送，各自用上对方留下的空隙。',
    } },
    { heading: { en: 'Adding up what you could not hear', zh: '把听不见的东西加起来' }, text: {
      en: 'None of those fragments is audible on its own. But the receiver already knows the shape of the train — when each fragment comes and what is in it — so it need not detect anything to start: it accumulates blind, millisecond after millisecond, and only decides at the end. Doubling the fragments doubles what has accumulated, and the sum can clear a threshold no part of it could.',
      zh: '这些片段单独拿出来，一个也听不见。但接收机事先已经知道这一串的形状——每个片段什么时候来、里面装的是什么——所以它根本不需要先检出什么才能开始：它盲目地累加，一毫秒又一毫秒，直到最后才下判断。片段数量翻一番，累加起来的量也翻一番，而这个和可以越过其中任何一片都越不过的门限。',
    } },
    { heading: { en: 'Who does the talking', zh: '谁来说话' }, text: {
      en: 'Knowing the shape of the train in advance has to come from somewhere, and not over the wideband radio. A small narrowband radio sits beside it and carries the words: a Poll that opens the round, a Response that accepts it, and at the end a Report carrying the reply time the initiator needs. Between those, the wideband radio carries timing and nothing else.',
      zh: '事先知道这一串的形状，总得有个来处，而它不是从宽带那台电台来的。旁边还有一台小小的窄带电台，由它承载话语：一帧 Poll 打开这一轮，一帧 Response 接受它，末尾再由一帧 Report 把发起方需要的回复时间捎回去。在这两头之间，宽带电台只承载时间，别的什么也不载。',
    } },
    { heading: { en: 'Reach is not accuracy', zh: '够得着不等于测得准' }, text: {
      en: 'The train buys distance, and only distance. The first path through brick still arrives late, so every range comes back long by the same amount, round after round — a bias, not noise, which the quality byte on each range flags as an obstructed path. The fix inherits it whole. Nothing here makes the measurement better; it makes a measurement exist.',
      zh: '这一串片段买来的是距离，而且只有距离。穿过砖墙的首径依旧迟到，于是每次测距都偏长，而且每轮偏得一样多——这是偏差，不是噪声，附在每条距离上的品质字节会把它标成被遮挡的路径。整块的定位把这份偏差原封不动地继承下来。这里没有任何东西让测量变得更准，它只是让测量得以存在。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The room, and what reaches across it', zh: '这个房间，以及什么能穿过去' }, head: [
      { en: 'The scene', zh: '场景' }, { en: 'Value', zh: '取值' },
    ], rows: [
      [{ en: 'The hall', zh: '大厅' }, N('22 × 8 m')],
      [{ en: 'Brick partitions at', zh: '砖墙位于' }, N('x = 5 m, x = 10 m')],
      [{ en: 'Anchors to tag', zh: '锚点到标签' }, N('13.04, 13.04, 12.76 m')],
      [{ en: 'Two walls of brick', zh: '两道砖墙' }, N('24 dB')],
      [{ en: 'One fragment on arrival', zh: '一个片段到达时' }, N('−100.26 / −100.07 dBm')],
      [{ en: 'What the receiver needs', zh: '接收机需要的门限' }, N('−93 dBm')],
    ] },
    { text: {
      en: 'Each fragment lands about seven decibels under the receiver, and the three anchors are placed so that they are nearly equally far away: at the threshold this lesson is about, either all three are heard or none of them is.',
      zh: '每个片段到达时比接收机门限低了约七个分贝；而三个锚点的摆法让它们与标签几乎等距：在本课要讲的那个临界点上，要么三个都被听见，要么一个也听不见。',
    } },
    { kind: 'table', heading: { en: 'One round, as the log prints it', zh: '一轮，日志怎么印' }, head: [
      { en: 'When', zh: '何时' }, { en: 'The line', zh: '那一行' },
    ], rows: [
      [N('0 ms'), N('tag-1 UWB round 0 of block 0 (MMS): 28 slots × 500.0 µs')],
      [N('0 ms'), N('tag-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)')],
      [N('2.000 ms'), N('tag-1 TX RMARKER → anchor-1 RSF: counter 336330610684')],
      [N('2.000 ms'), N('tag-1 → anchor-1 UWBRSF 0 B @0 Mbps (82.1 µs)')],
      [N('9.500 ms'), N('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm')],
      [N('9.500 ms'), N('anchor-1 RX RMARKER ← tag-1 RSF: counter 26504711136 (75 % within 12 ns)')],
      [N('12.000 ms'), N('anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')],
      [N('12.608 ms'), N('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')],
    ] },
    { text: {
      en: 'A round is 28 slots of 500 µs, so 14 ms, and it holds one anchor; three of them fit easily inside the 200 ms block.',
      zh: '一轮是 28 个 500 µs 的时隙，合 14 ms，而且只装一个锚点；三轮轻松放进 200 ms 的块里。',
    } },
    { text: {
      en: 'Four slots open the round, twenty carry the fragments, and the responder reports in slot 24.',
      zh: '开头四个时隙用来开场，二十个承载片段，响应方在第 24 个时隙给出报告。',
    } },
    { text: {
      en: 'The narrowband side is the slow part. Its three messages take 1.760 ms of the round’s 3.073 ms of air, while all sixteen fragments together take 1.313 ms — and one transmit stamp is taken per train, not per fragment.',
      zh: '慢的是窄带那一侧。它那三条消息占掉整轮 3.073 ms 空口时间里的 1.760 ms，而十六个片段加起来才 1.313 ms——而且每串只取一个发送时间戳，不是每个片段一个。',
    } },
    { text: {
      en: 'Every range is long by the same 1.199 m: brick delays a first path by 2 ns and the ray crosses two walls each way, which a two-way range keeps rather than cancels.',
      zh: '每一次测距都偏长同样的 1.199 m：砖墙给首径添 2 ns，而射线来回各穿两道墙，这一份双向测距留了下来，没有抵消掉。',
    } },
    { text: {
      en: 'The fix inherits it whole — (14.22, 4.05) m against a true (13.00, 4.00) — while the ellipse beside it, which knows only noise, stays at centimetres.',
      zh: '定位把它整个继承过去——(14.22, 4.05) m，真值 (13.00, 4.00)——而旁边那个只认识噪声的椭圆，仍停在厘米量级。',
    } },
  ],
  deeper: [
    { heading: { en: 'Why there is no preamble offset to subtract', zh: '为什么没有前导偏移要减' }, text: {
      en: 'An ordinary ranging frame carries a preamble the receiver must find before anything can be timed, and the timestamp is defined at a marker some known distance into the frame. A fragment has none of that: the receiver knew when it was coming, so the timestamp is simply the first pulse of the first fragment of the train. One RMARKER per train, taken at its start, is what both the transmit and the receive record hold.',
      zh: '普通的测距帧带着前导，接收机得先找到它才谈得上计时，而时间戳定义在帧内某个已知位置的标记上。片段完全没有这一套：接收机本来就知道它什么时候来，于是时间戳就是这一串里第一个片段的第一个脉冲。每串一个 RMARKER，取在串的开头——发送记录和接收记录里存的都是它。',
    } },
    { heading: { en: 'The integrity fragments this scene does not send', zh: '本场景没有发的那些完整性片段' }, text: {
      en: 'A train may carry a second kind of fragment after the ranging ones: integrity fragments, whose sequence is not known in advance and which therefore cannot be forged by replaying a recording. The session here asks for none of them, so no range in the run carries an integrity verdict at all — the log simply has no such field to print. Reach was the problem to solve; integrity is a separate bill, paid in slots.',
      zh: '在测距片段之后，一串还可以带上第二种片段：完整性片段。它们的序列事先并不公开，因此无法靠重放录音伪造。本课的会话一个也不要，所以整段运行里没有任何一次测距带有完整性判定——日志里干脆就没有这个字段可印。这里要解决的问题是够得着；完整性是另一张账单，用时隙来付。',
    } },
    { heading: { en: 'Why the anchors stand where they do', zh: '锚点为什么站在那里' }, text: {
      en: 'The three anchors are 13.04, 13.04 and 12.76 m from the tag — as nearly equidistant as the first bay allows. That is deliberate: the whole lesson turns on a single threshold, and an anchor pushed up against the first partition would be 8.58 m away, 3.6 decibels louder, and would go on ranging on half a train while the other two heard nothing. Making the three fail together is what makes the threshold visible.',
      zh: '三个锚点到标签分别是 13.04、13.04 与 12.76 m——在第一个隔间里能做到的最接近等距。这是有意为之：整堂课都系在同一个临界点上，而若把一个锚点贴到第一道砖墙上，它就只有 8.58 m 远、响 3.6 个分贝，于是它会在半串片段上照常测距，而另外两个什么也听不见。让三者一起失败，才让这个临界点看得见。',
    } },
  ],
  sources: [
    { en: 'Almost nothing here is IEEE Std 802.15.4-2024. The units are: RSTU, RCTU, the block and its slots; so is the narrowband radio itself, the Clause 12 O-QPSK PHY at 250 kb/s.',
      zh: '本课几乎没有一处出自 IEEE Std 802.15.4-2024。单位是标准的：RSTU、RCTU、块与它的时隙；那台窄带电台本身也是标准的，即第 12 章、250 kb/s 的 O-QPSK PHY。' },
    { en: 'The multi-millisecond packet, the fragments and everything that turns that narrowband radio into a control radio for UWB come from P802.15.4ab, at D5.0 in Sponsor-ballot recirculation. The draft is members-only, so this paraphrases four TG4ab contributions: 15-22/0381r5 (the ranging cycle), 15-23/0100r2 (fragments and the narrowband PHY), 15-23/0502r3 (parameter sets) and 15-22/0205r0 (the energy budget). The balloted draft may differ.',
      zh: '多毫秒分组、片段，以及把那台窄带电台变成 UWB 控制电台的一切，都来自 P802.15.4ab：它处于 Sponsor 投票再循环阶段，版本为 D5.0。该草案仅对会员开放，所以这里改写自 TG4ab 的四篇提案文稿：15-22/0381r5（测距周期）、15-23/0100r2（片段与窄带 PHY）、15-23/0502r3（参数集）与 15-22/0205r0（能量预算）。已投票的草案可能与此不同。' },
    { en: 'The room is the simulator’s own: a 22 × 8 m hall, two brick partitions at 12 dB each, an NLOS excess delay of 2.0 ns per brick wall, and a session on the draft’s default ranging cycle with the narrowband control channel in UNII-3, where nothing else in this scene is talking.',
      zh: '房间是仿真器自己的模型取值：22 × 8 m 的大厅、两道各 12 dB 的砖墙、每道砖墙 2.0 ns 的非视距额外时延，以及一个跑在草案默认测距周期上的会话，窄带控制信道落在 UNII-3，而本场景里那里没有别人在说话。' },
  ],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: { en: 'Four fragments', zh: '四个片段' }, scenario: () => uwbMmsScenario('four') },
    { label: { en: 'Set rsf-1', zh: '参数集 rsf-1' }, scenario: () => uwbMmsScenario('rsf1') },
    { label: { en: '4z for comparison', zh: '拿 4z 作对照' }, scenario: () => uwbMmsScenario('twr') },
  ],
  jumps: [
    J('the narrowband poll that opens the round', '打开轮次的那帧窄带 POLL', firstNbPoll),
    J('the first fragment of the first train', '第一串片段里的第一个', firstUwbRsf),
    J('what the far end made of that train', '对端如何判定这一串片段', firstUwbTrain),
    J('the narrowband report that closes it', '收尾的那帧窄带 REPORT', firstNbReport),
    J('the range the two of them produce', '两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [
    { en: 'Nothing wideband happens first. The tag opens the round with a narrowband poll, the anchor answers half a millisecond later, and only then is either side primed to listen for fragments. One round holds one anchor, so the next anchor waits its turn.',
      zh: '一开始空口上没有任何宽带动静。标签用一帧窄带 POLL 打开这一轮，锚点在半毫秒后作答，到这时两边才算就绪、才去听片段。一轮只装一个锚点，所以下一个锚点得等到自己那一轮。' },
    { en: 'Then the fragments: two interleaved trains, one frame every half millisecond, each of zero octets at no data rate — a fragment carries nothing. In the slot after the last one, each side rules on what it accumulated, and only then does a receive stamp appear.',
      zh: '接着是片段：两串交错着来，每半毫秒一帧，每一帧零字节、没有速率——片段里什么也不装。在最后一个片段之后的那个时隙里，两边各自对累加到的东西下判断，而接收时间戳直到这时才出现。' },
  ],
  tryThis: [
    { en: 'Load “4z for comparison”: the same room, the same nodes, ordinary two-way ranging. Not one range comes back. The anchors wait for a Poll they never hear and the tag waits out every response slot, so the log fills with timeouts instead.',
      zh: '载入“拿 4z 作对照”：同样的房间、同样的节点，改用普通的双向测距。一次测距也回不来。锚点在等一帧它们永远听不到的 Poll，标签把每个响应时隙都等空，于是日志里填满的是超时。' },
    { en: 'Open the tag’s inspector after a few blocks. One table says how many fragments each peer’s train was heard in full and what the sum came to; the other carries the ranges, each long by the same amount, each with the obstructed-path byte.',
      zh: '跑过几个块之后打开标签的检视面板。一张表写着每个对端那一串收全了几个片段、加起来是多少；另一张是各次测距，每一次都偏长同样多，每一次都带着“被遮挡路径”那个字节。' },
  ],
  quiz: [
    {
      q: { en: 'Why not simply send one longer ranging frame instead of a train of fragments?', zh: '为什么不干脆发一帧更长的测距帧，而要发一串片段？' },
      options: [
        { en: 'A longer frame would not fit in a slot', zh: '更长的帧塞不进一个时隙' },
        { en: 'The cap is an average over each millisecond, so a longer frame is not louder; a train spends a fresh millisecond’s allowance again and again', zh: '限制是按每毫秒取的平均，所以帧更长并不更响；而一串片段是把每一毫秒的额度一次次重新花掉' },
        { en: 'The receiver cannot timestamp a long frame', zh: '接收机没法给长帧打时间戳' },
      ],
      answer: 1,
      explain: { en: 'No single moment may be made louder, but nothing caps how many milliseconds you use — and the far end can add them up.', zh: '任何一瞬都不能更响，但用掉多少毫秒并不受限——而对端可以把它们加起来。' },
    },
    {
      q: { en: 'What is the narrowband radio for, if the wideband one does the measuring?', zh: '既然测量是宽带电台做的，那窄带电台是干什么的？' },
      options: [
        { en: 'It measures a second, coarser distance as a cross-check', zh: '它再粗略地量一次距离，用来相互校验' },
        { en: 'It carries the words — open the round, accept it, report the reply time — so the receiver knows the train’s shape before any of it arrives', zh: '它承载话语——开场、接受、报出回复时间——好让接收机在片段到来之前就知道这一串的形状' },
        { en: 'It wakes the anchors up between blocks', zh: '它在块与块之间把锚点唤醒' },
      ],
      answer: 1,
      explain: { en: 'Accumulating blind only works if you already know when each fragment comes and what is in it. That knowledge arrives over the small radio.', zh: '盲目累加的前提，是你已经知道每个片段何时到、里面装什么。这份知识是由那台小电台送来的。' },
    },
  ],
}
