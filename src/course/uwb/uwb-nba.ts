/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · The narrowband radio shares 6 GHz too.
 *
 * The companion to "Sixteen milliseconds of energy". That lesson put its control
 * channel in UNII-3, where nothing else lives, and said nothing about the price
 * of the second radio. This one puts it in UNII-5 — channel 200, 6301.25 MHz —
 * one of the thirty-two narrowband channels that fit inside the Wi-Fi 7 router's
 * 80 MHz on 6 GHz channel 71, and turns on the listen-before-talk rule the draft
 * brings with it. The radio is Clause 12's own O-QPSK PHY; only what is done with
 * it — the 250 channels, the control cycle, listen before talk — is 4ab draft.
 *
 * The result is the lesson: the UWB side is flawless (4.76 m across an empty
 * room, 8/8 fragments, 34.5 dB of margin) and the session still produces one
 * range and no position in 1.3 seconds, because a busy check costs a whole
 * ranging block and a saturated 6 GHz laptop is almost never quiet. Moving the
 * control channel 250 MHz down gives everything back; hopping gives back the
 * fraction of blocks the hash puts outside; switching the rule off gives back
 * most of the ranging and charges Wi-Fi 10.95 % of its throughput for it.
 * Every number quoted below is pinned in tests/course/uwb-nba.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import {
  J, LESSON_6G_WIDTH_MHZ, N, anchor, firstNbLbt, firstNbPoll, firstNbReport, firstUwbRange,
  firstUwbTrain, node, oneRoom, uwbSc, uwbTag, wifi6g, type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs: one control channel inside the router's 80 MHz, one outside,
 * an allow list of four, or the inside channel with the listen-before-talk rule switched off. */
export type UwbNbaVariant = 'base' | 'outside' | 'hop' | 'noLbt'

/** 802.11ax 6 GHz channel 71 — the coexistence lesson's router, 80 MHz over 6265–6345 MHz. */
export const WIFI_6G_CENTER_MHZ = 6305
/** The narrowband allow list each scene runs: 200 is 6301.25 MHz (inside the router's channel),
 * 100 is 6051.25 MHz (outside), and the hop list mixes two of each — 210 is 6326.25 MHz, also
 * inside, and 150 is 6176.25 MHz, also outside. */
export const NBA_CHANNELS: Record<UwbNbaVariant, number[]> = {
  base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200],
}

/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The four corners of the 10 × 8 m room, as lesson 5 and the coexistence lesson place them. */
export const NBA_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** The tag, 1.50 m from the router in three dimensions — the distance the whole lesson turns on. */
export const TAG_POS = { x: 4, y: 3.5 }
/** The router, at the middle of the room and 2 m up. */
export const ROUTER_POS = { x: 5, y: 4, z: 2.0 }
/** The laptop backing up flat out, 3.35 m from the tag. */
export const LAPTOP_POS = { x: 7, y: 5 }

/**
 * The coexistence lesson's room and its two Wi-Fi devices — a Wi-Fi 7 router on 6 GHz
 * channel 71 and a saturated laptop — with an MMS session on top: four
 * corner anchors, one tag, UWB **channel 9** so the ranging frames themselves cannot meet
 * 6 GHz Wi-Fi, and `report: 'bi'` so both ends of a pair round have a narrowband message of
 * their own to get out. Only the narrowband control radio couples with Wi-Fi here, which is
 * the point: everything that goes wrong below goes wrong on 2.5 MHz.
 *
 * The Wi-Fi nodes are listed first, so the 6 GHz link is built — and its mediator decided —
 * before the ranging session asks for one.
 */
export function uwbNbaScenario(variant: UwbNbaVariant = 'base'): Scenario {
  const ap = node('ap', 'Router', 'ap', ROUTER_POS.x, ROUTER_POS.y, 'eht', 'idle',
    { edca: true, txop: true, ampdu: true }, ROUTER_POS.z)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', LAPTOP_POS.x, LAPTOP_POS.y, 'saturated')
  return uwbSc(
    oneRoom(),
    [
      ap, laptop,
      ...NBA_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      uwbTag('uwb-1', 'Phone', TAG_POS.x, TAG_POS.y, TAG_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true, channel: 9,
      mms: {
        ...DEFAULT_UWB_SESSION.mms, nbChannels: NBA_CHANNELS[variant],
        nbLbt: variant === 'noLbt' ? 'off' : 'auto', report: 'bi',
      },
    },
    { sixGhzCenterMhz: WIFI_6G_CENTER_MHZ },
  )
}

export const uwbNba: Lesson = {
  id: 'uwb-nba',
  module: 15,
  title: { en: 'The narrowband radio shares 6 GHz too', zh: '窄带电台也共享 6 GHz' },
  body: [
    { text: {
      en: 'The radio itself is the standard’s: the 250 kb/s O-QPSK PHY of IEEE Std 802.15.4-2024 Clause 12, and the 576 µs a 12-octet message takes comes straight from it. Everything that makes it an NBA-UWB control radio — the 250 channels, the poll/response/report cycle, the listen-before-talk rule, the block skip — is P802.15.4ab, at D5.0 in Sponsor-ballot recirculation in September 2026; that draft is members-only, so this is paraphrased from two TG4ab contributions: 15-22/0381r5 (channels, LBT, the block-wise hop) and 15-23/0100r2 (the PHY configuration and the channel counts). The balloted draft may differ. One layer is regulation — the −75 dBm/MHz threshold the draft takes from ETSI EN 303 687 — and the rest is model: the channel-centre formula is reconstructed from the published counts and band edges, the block-wise hop uses the simulator’s own string hash where the draft specifies AES-128-CTR keyed by the session seed, and one instantaneous power reading stands in for the draft’s 9 µs assessment.',
      zh: '电台本身是标准里的：IEEE Std 802.15.4-2024 第 12 章那部 250 kb/s 的 O-QPSK PHY，一帧 12 字节的消息要用 576 µs，这个数字就直接出自它。真正把它变成 NBA-UWB 控制电台的那些东西——250 个信道、轮询/响应/报告的周期、先听后发规则、跳过整块——才来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票再循环阶段，版本 D5.0；该草案仅对会员开放，所以这里改写自 TG4ab 的两篇提案文稿：15-22/0381r5（信道规划、先听后发规则与按块跳变）与 15-23/0100r2（PHY 配置与信道数目）。已投票的草案可能与之不同。其中只有一层来自法规——草案援引 ETSI EN 303 687“基于帧的设备”规则所给的 −75 dBm/MHz 能量检测门限——其余都是模型：信道中心频率的公式是依据已公开的信道数目与频段边界反推出来的；按块跳变用的是仿真器自己的字符串散列，而草案规定的是以会话种子为密钥的 AES-128-CTR；草案要求评估至少 9 µs，这里以一次瞬时功率读数代之。',
    } },
    { heading: { en: 'Two hundred and fifty channels of 2.5 MHz', zh: '二百五十个 2.5 MHz 信道' }, text: {
      en: 'The narrowband radio has 250 channels 2.5 MHz wide: 50 in UNII-3 from 5726.25 MHz up, and 200 in UNII-5 — the 6 GHz Wi-Fi band — from 5926.25 MHz up. One 20 MHz Wi-Fi channel covers eight of them, and this Wi-Fi 7 router’s 80 MHz (channel 71 of the 6 GHz plan, 6265 to 6345 MHz) wholly contains thirty-two, numbers 186 to 217. The session’s control channel is 200, at 6301.25 MHz — one of the thirty-two. Channel 100 would be 6051.25 MHz, with 212.5 MHz of empty spectrum between its upper edge and the router’s.',
      zh: '窄带电台共有 250 个信道，每个 2.5 MHz：UNII-3 里 50 个，自 5726.25 MHz 起；UNII-5——也就是 6 GHz Wi-Fi 频段——里 200 个，自 5926.25 MHz 起。一个 20 MHz 的 Wi-Fi 信道能盖住其中八个；而这台 Wi-Fi 7 路由器的 80 MHz——6 GHz 信道表的 71 号信道，6265 至 6345 MHz——整整包住三十二个，编号 186 到 217。本会话的控制信道是 200 号，中心 6301.25 MHz，正是那三十二个之一。若改用 100 号，中心是 6051.25 MHz，其上边沿与路由器的下边沿之间隔着 212.5 MHz 的空白频谱。',
    } },
    { kind: 'formula', heading: { en: 'The rule the band comes with', zh: '这个频段附带的规则' }, text: {
      en: 'threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm\n20 dBm over 80 MHz → 20 + 10·log10(2.5 / 80) = 4.95 dBm inside one narrowband channel\n4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m',
      zh: 'threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm\n20 dBm 摊在 80 MHz 上 → 20 + 10·log10(2.5 / 80) = 4.95 dBm 落在一个窄带信道内\n4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m',
    }, note: {
      en: 'Before each narrowband transmission the device assesses the channel for at least 9 µs and stays silent at −75 dBm/MHz or more — over 2.5 MHz, −71.02 dBm. The three lines are arithmetic, not a measurement: an 80 MHz PPDU at 20 dBm puts 4.95 dBm into any 2.5 MHz slice of itself, and under the Wi-Fi link’s own indoor law it crosses the threshold 8.62 m away. Inside that radius the check stops being about distance.',
      zh: '每次窄带发射之前，设备要对信道评估至少 9 µs，若读数达到 −75 dBm/MHz 就不许发；摊到整个 2.5 MHz 上，这个门限是 −71.02 dBm。上面三行是算术，不是测量：20 dBm 的 80 MHz PPDU 在自己带内任意 2.5 MHz 的一片里都是 4.95 dBm，按 Wi-Fi 链路自己的室内传播律，它在离接入点 8.62 m 处跨过门限。在这个半径之内，这项检测就与距离无关了。',
    } },
    { heading: { en: 'A check that only asks who is talking', zh: '只问“此刻谁在发”的检测' }, text: {
      en: 'The tag at (4.00, 3.50, 1.00) and the router at (5.00, 4.00, 2.00) are √(1² + 0.5² + 1²) = 1.50 m apart, well inside the 8.62. An 80 MHz PPDU from the router reads −48.23 dBm there, 22.8 dB over the threshold; the router’s 20 MHz control frames read −42.21 dBm; the laptop, 3.35 m away at 15 dBm, reads −63.72, still 7.3 dB over. So the check only discovers whether anyone is on the air just then — and the laptop is saturated.',
      zh: '标签站在 (4.00, 3.50, 1.00)，路由器在 (5.00, 4.00, 2.00)：√(1² + 0.5² + 1²) = 1.50 m，远在 8.62 m 之内。路由器的 80 MHz PPDU 在那里是 −48.23 dBm，高出门限 22.8 dB；它的 20 MHz 控制帧是 −42.21 dBm；笔记本在 3.35 m 外以 15 dBm 发射，是 −63.72 dBm，仍高出 7.3 dB。于是这项检测能查出的只有一件事：此刻是否恰好有人在发——而那台笔记本是饱和的。',
    } },
    { heading: { en: 'What one busy check costs', zh: '一次“忙”的代价' }, text: {
      en: 'A busy check is not a deferral: the draft’s discontinuation rule stops that device’s narrowband transmissions for the rest of the block, and with no POLL there is no cycle. At t = 0 the channel is clear: POLL, RESP at 1.000 ms, eight fragments each way at 34.5 dB of margin — anchor 1 is 4.76 m off — and the anchor’s REPORT at 12.000 ms gives the tag the only range of the run. Then at 13.000 ms the tag’s own report slot finds the channel busy, and block 0 is over for the tag: rounds 1 to 3 run, but it says nothing in them.',
      zh: '一次“忙”不是一次退避：按草案的中止规则，该设备在本测距块剩下的时间里不再发出任何窄带帧；而没有 POLL，整个周期根本不会发生。t = 0 时信道恰好空闲，POLL 发了出去，1.000 ms 处 RESP 作答，八个片段来回穿过房间，余量 34.5 dB——anchor-1 才 4.76 m 远，UWB 这一侧从来不成问题——12.000 ms 处锚点的 REPORT 让标签拿到了整段运行里唯一一次测距。接着 13.000 ms，标签自己的报告时隙读到了“忙”，第 0 个块对标签而言就此结束：第 1 到 3 轮照跑，只是它在里面什么也不说。',
    } },
    { kind: 'table', heading: { en: 'Four ways to place one control channel', zh: '同一个控制信道的四种放法' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'Narrowband channel', zh: '窄带信道' },
      { en: 'Blocks skipped', zh: '跳过的块' }, { en: 'Tag ranges', zh: '标签测距' },
      { en: 'Fixes', zh: '定位' },
    ], rows: [
      [{ en: 'Inside the router’s channel', zh: '落在路由器的信道之内' }, N('200 · 6301.25 MHz'), N('7 of 7'), N('1'), N('0')],
      [{ en: 'Outside it', zh: '避开它' }, N('100 · 6051.25 MHz'), N('0'), N('28'), N('7')],
      [{ en: 'Hopping over four', zh: '在四个信道间跳变' }, N('100 / 150 / 200 / 210'), N('4 of 7'), N('13'), N('3')],
      [{ en: 'Inside it, no listening', zh: '落在之内，且不先听' }, N('200 · 6301.25 MHz'), N('0'), N('21'), N('5')],
    ] },
    { heading: { en: 'Hopping averages; it does not avoid', zh: '跳变是在平均，不是在躲开' }, text: {
      en: 'The allow list [100, 150, 200, 210] holds two channels outside the router’s 80 MHz and two inside — 6326.25 MHz is inside too. Block b takes list[hash(“7:b”) mod 4], giving 100, 210, 200, 150, 100, 210, 200 over the run. Blocks 0, 3 and 4 land outside and run in full; 1, 2, 5 and 6 land inside and are skipped, though block 5 gets a range out before its report slot is stopped. Three fixes instead of seven: hopping buys the share of blocks the hash puts somewhere quiet.',
      zh: '允许列表 [100, 150, 200, 210] 里有两个信道在路由器的 80 MHz 之外，两个在之内——6326.25 MHz 同样落在里面。第 b 块取 list[hash(“7:b”) mod 4]，在这段运行的七个块上依次给出 100、210、200、150、100、210、200。第 0、3、4 块落在外面，完整跑完；第 1、2、5、6 块落在里面，被跳过，其中第 5 块在报告时隙被拦下之前还发出了一次测距。七次定位变成三次：跳变买到的，恰好是散列把多少个块丢到清静处的那个比例。',
    } },
    { heading: { en: 'What the narrowband radio costs Wi-Fi', zh: '窄带电台让 Wi-Fi 付出什么' }, text: {
      en: 'In “Sharing 6 GHz” a ranging frame’s −14 dBm, spread over 499.2 MHz, only trips Wi-Fi’s −62 dBm energy detection within about 40 cm. This radio is different: 10 dBm inside 2.5 MHz, free space at 6301.25 MHz, and 10 − 48.44 − 20·log10 d = −62 puts the radius at 15.07 m, longer than the room. Every narrowband frame is audible here. No record names the emitter, so count the clear-channel transitions that go busy on energy alone inside a narrowband frame: 44 in 1.3 seconds with the rule off — a 576 µs POLL or RESP, a 608 µs REPORT — against none in the uncoupled scene. Not 108 twice over: a radio already busy or transmitting makes no new transition.',
      zh: '在《共享 6 GHz》里，一个测距帧的 −14 dBm 摊在 499.2 MHz 上，只在约 40 cm 以内才能触动 Wi-Fi 的 −62 dBm 能量检测。这部电台完全是另一种东西：10 dBm 全落在 2.5 MHz 内，按 6301.25 MHz 的自由空间传播，10 − 48.44 − 20·log10 d = −62 给出的半径是 15.07 m，比房间还长。这里每一个窄带帧，每一台 Wi-Fi 收发机都听得见。没有任何记录会写明“是谁在发”，所以改数另一件事：落在某个窄带帧期间、且仅因能量而转为“忙”的那些 CCA 跳变——关掉规则后，1.3 秒里 44 次，而能触发它们的只有一帧 576 µs 的 POLL 或 RESP、或一帧 608 µs 的 REPORT；而在不耦合的那个场景里一次也没有。不是 108 的两倍，因为本来就忙着、或正在发的收发机，根本不会再跳一次。',
    } },
    { text: {
      en: 'Listening does not make a narrowband frame harmless, only rarer. With the rule on, six reach the air in 1.3 seconds and five Wi-Fi PPDUs fail behind them; with it off, 108 and 87. The laptop’s throughput drops from 407.215 Mb/s to 362.631, a loss of 10.95 %. The model’s simplification shows: one reading at the slot start says nothing about the 576 µs that follow, so a PPDU beginning during a narrowband frame lands on it anyway.',
      zh: '而“先听”并不能让一个窄带帧变得无害——它只是让这样的帧变少。规则开着时，1.3 秒里只有六个窄带帧上了空口，其后有五个 Wi-Fi PPDU 解调失败；关掉之后，108 个上了空口，87 个失败：两边的比例差不多，而笔记本的吞吐从 407.215 Mb/s 掉到 362.631 Mb/s，损失 10.95 %。这里露出来的正是模型自身的简化：时隙开头的一次功率读数，对随后的 576 µs 什么也没说，于是在窄带帧中途开始的那个 PPDU，照样撞了上去。',
    } },
    { heading: { en: 'Where a control channel belongs', zh: '控制信道该放在哪里' }, text: {
      en: 'The other side of that trade is uncomfortable: with the rule off the tag gets 21 ranges and 5 fixes instead of 1 and 0. The polite configuration is the useless one, and only the regulator decides which you may ship. Hence the draft’s default allow list [3] — 5733.75 MHz, in UNII-3, where listening first is optional. A control channel does not need the band Wi-Fi is in; it needs two and a half megahertz nobody wants, and there are 250.',
      zh: '这笔交易的另一面并不好看：把规则关掉，标签拿到的是 21 次测距、5 次定位，而不是 1 次和 0 次。守规矩的那套配置正是没用的那套，而能不能出货只由监管说了算。这也正是草案自带的默认允许列表是 [3] 的原因——5733.75 MHz，位于 UNII-3，那里先听后发是可选的，而任何 6 GHz Wi-Fi 信道都够不着。窄带控制信道并不需要待在 Wi-Fi 所在的频段里，它只需要两兆半没人要的频谱——而可选的有 250 个。',
    } },
  ],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: { en: 'Outside the router’s channel', zh: '避开路由器的信道' }, scenario: () => uwbNbaScenario('outside') },
    { label: { en: 'Hop over four channels', zh: '在四个信道间跳变' }, scenario: () => uwbNbaScenario('hop') },
    { label: { en: 'No LBT', zh: '不先听后发' }, scenario: () => uwbNbaScenario('noLbt') },
  ],
  jumps: [
    J('the narrowband poll that opens the round', '打开轮次的那帧窄带 POLL', firstNbPoll),
    J('what the far end made of the train', '对端如何判定这一串片段', firstUwbTrain),
    J('the narrowband report that closes it', '收尾的那帧窄带 REPORT', firstNbReport),
    J('the one range of the whole run', '整段运行里唯一的一次测距', firstUwbRange),
    J('the busy check that ends the block', '终结这个块的那次“忙”检测', firstNbLbt),
  ],
  observe: [
    { en: 'At t = 0 the round opens on the other radio: “uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”. Channel 200 is in UNII-5, so listening first is not optional — the POLL went out because that instant was clear, not because nothing checked.',
      zh: 't = 0 处，这一轮是在另一部电台上开场的：“uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”。200 号信道在 UNII-5，所以先听后发不是可选项——这帧 POLL 发得出去，是因为那一瞬间恰好空闲，而不是因为没人检测。' },
    { en: 'At 13.000 ms the tag’s own report slot: “uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”. Nothing of the tag’s is heard again until block 1: anchor 1 prints “anchor-1 UWB slot 26: no nb-report from uwb-1” at 14.000 ms, anchor 2 “anchor-2 UWB slot 0: no nb-poll from uwb-1” at 15.000 ms.',
      zh: '13.000 ms 处轮到标签自己的报告时隙：“uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”。此后直到第 1 个块，空口上再也听不到标签。14.000 ms 处 anchor-1 印出 “anchor-1 UWB slot 26: no nb-report from uwb-1”，15.000 ms 处 anchor-2 印出 “anchor-2 UWB slot 0: no nb-poll from uwb-1”。' },
    { en: 'The tag’s inspector reads “200 · 6301.25 MHz” and, under listen before talk, “7 busy · 7 blocks skipped”. Its two train rows are untouched: 8 / 8 heard, +34.5 and +32.0 dB, detected. Nothing is wrong with the UWB side.',
      zh: '标签的检视面板上写着 “200 · 6301.25 MHz”，而“先听后发”一行是 “7 次忙 · 跳过 7 个块”——运行中的七个块里，每个都有一次判忙。它那两行片段序列却纹丝不动：8 / 8 收到，+34.5 dB 与 +32.0 dB，检出。UWB 这一侧一点毛病也没有。' },
    { en: 'The one that worked: “uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)” at 12.608 ms. One range in 1.3 seconds and no position — a fix needs three — against 29 timeouts. Anchors 1 and 2 have one too, in block 3.',
      zh: '唯一成功的一件事：12.608 ms 处的 “uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”。1.3 秒里一次测距，一次定位也没有——解一个定位要三次测距——而超时有 29 次。anchor-1 与 anchor-2 也各有一次判忙，都发生在第 3 个块。' },
  ],
  tryThis: [
    { en: 'Load “Outside the router’s channel”: 6051.25 MHz, and the coupling disappears — not one busy check, 28 ranges, and a fix in all seven blocks on four anchors — “uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”. The Wi-Fi side is identical to a run with no ranging session: 407.215 Mb/s, not one failed PPDU. That gap cost nothing and bought everything.',
      zh: '载入“避开路由器的信道”。100 号是 6051.25 MHz，整套耦合随之消失：一次判忙也没有，28 次测距，七个块每一块都用四个锚点解出定位——“uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”。Wi-Fi 这一侧与完全没有测距会话的那次运行一模一样：407.215 Mb/s，没有一个 PPDU 失败。那一段空白频谱什么也没花掉，却把一切都买了回来。' },
    { en: 'Now “Hop over four channels”: blocks 0, 3 and 4 land outside and give three fixes; the other four are skipped. Then “No LBT”, which stops yielding on 200 — 21 ranges and 5 fixes, and the interference runs the other way. Seven narrowband frames die at the tag, five REPORTs and two RESPs, the first “uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”: the router’s own 20 MHz control frame, 1.50 m away.',
      zh: '再载入“在四个信道间跳变”：第 0、3、4 块落在外面，给出三次定位，另外四块被跳过。然后载入“不先听后发”：信道仍是 200，只是不再让路——21 次测距、5 次定位，而干扰这回反了个方向。七个窄带帧死在标签处，五帧 REPORT、两帧 RESP，头一条是 “uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”：那是路由器自己的 20 MHz 控制帧，就在 1.50 m 外。' },
  ],
  quiz: [
    {
      q: { en: 'The tag is 1.50 m from the router and its trains clear sensitivity by 34.5 dB. Why does the base scene produce one range in 1.3 seconds?', zh: '标签离路由器只有 1.50 m，它的片段序列高出接收灵敏度 34.5 dB。为什么基础场景 1.3 秒里只测出一次距离？' },
      options: [
        { en: 'The fragments are buried by Wi-Fi', zh: '片段被 Wi-Fi 压住了' },
        { en: 'Listen before talk is an energy test, not a margin test: the laptop alone reads −63.72 dBm at the tag, the router 22.8 dB over when it sends, and one busy check costs the whole block', zh: '先听后发测的是能量，不是余量：光是那台饱和的笔记本在标签处就是 −63.72 dBm，路由器一发更高出门限 22.8 dB，而一次判忙要赔上整整一个块' },
        { en: 'The narrowband receiver is below its sensitivity at that distance', zh: '在那个距离上窄带接收机低于灵敏度' },
      ],
      answer: 1,
      explain: { en: 'Both links are excellent here; what fails is a rule. Every one of the tag’s seven busy checks reads −63.72 dBm — the laptop, 3.35 m away, uploading — and the router when it sends is 22.8 dB over. Seven blocks, seven checks, seven skipped.', zh: '两条链路在这里都好得很，失败的是一条规则。标签那七次判忙，每一次读到的都是 −63.72 dBm——3.35 m 外正在上传的笔记本；而路由器一发，还要高出门限 22.8 dB。七个块，七次检测，七个被跳过。' },
    },
    {
      q: { en: 'Two of the four channels in the hop list sit outside the router’s 80 MHz. Which blocks survive?', zh: '跳变列表里有两个信道在路由器的 80 MHz 之外。哪些块活了下来？' },
      options: [
        { en: 'Every other one — the list is used in order', zh: '每隔一个——列表是按顺序用的' },
        { en: 'Whichever the hash picks: list[hash(“7:b”) mod 4] gives 100, 210, 200, 150, 100, 210, 200, so blocks 0, 3 and 4 survive', zh: '散列挑中哪些就是哪些：list[hash(“7:b”) mod 4] 给出 100、210、200、150、100、210、200，于是活下来的是第 0、3、4 块' },
        { en: 'All of them — a busy channel is only used for part of a block', zh: '全都活着——一个忙信道只在块的一部分里被用到' },
      ],
      answer: 1,
      explain: { en: 'The draft hops with AES-128-CTR; the simulator’s hash stands in. The choice is made once per block and holds for all of it: half the list outside bought three blocks of seven.', zh: '草案用以会话种子为密钥的 AES-128-CTR 来跳变，仿真器以字符串散列代之；无论哪一种，选择都是每块一次，并且在整块之内不变。列表里一半在外面，买到的是七个块里的三个。' },
    },
    {
      q: { en: 'With listen before talk off the session gets 21 ranges instead of 1. What did that cost the Wi-Fi link?', zh: '关掉先听后发之后，会话拿到 21 次测距而不是 1 次。这让 Wi-Fi 链路付出了什么？' },
      options: [
        { en: 'Nothing measurable — a 10 dBm narrowband frame is far below the −62 dBm threshold', zh: '没有可测的代价——10 dBm 的窄带帧远低于 −62 dBm 的门限' },
        { en: '87 failed PPDUs and 10.95 % of the laptop’s throughput: 362.631 Mb/s against 407.215', zh: '87 个 PPDU 解调失败，以及笔记本吞吐的 10.95 %：362.631 Mb/s 对 407.215 Mb/s' },
        { en: 'Only carrier sense: the deferrals cost time, but no PPDU is lost', zh: '只是载波侦听：退避花掉了时间，但没有 PPDU 丢失' },
      ],
      answer: 1,
      explain: { en: '10 dBm in 2.5 MHz reaches −62 dBm at 15.07 m, further than this room is long. Listening does not change the damage per frame — five PPDUs behind six frames with it on, 87 behind 108 without — only how many frames there are.', zh: '2.5 MHz 里的 10 dBm 到 15.07 m 处仍有 −62 dBm，比这个房间还远，所以每台 Wi-Fi 收发机都听得见每一个窄带帧。先听并不改变“每帧造成多少损害”——开着时六个帧对应五个失败的 PPDU，关掉时 108 个对应 87 个——它改变的只是帧的数量。' },
    },
  ],
}
