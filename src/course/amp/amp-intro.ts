/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · A station that never contends.
 *
 * One Wi-Fi 7 router polls two battery-free ambient-power tags every 100 ms in
 * 2.4 GHz: CTS-to-self, AMP Trigger, four uplink slots, one AMP Ack per slot.
 * No Wi-Fi traffic, so the round stands alone and every microsecond of it is
 * visible. Every number quoted below is pinned in tests/course/amp-intro.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, ampAp, firstAmpAckToTag, firstAmpLost, firstAmpResp, firstAmpTrigger, oneRoom, sc, tag, txOf,
  type Lesson,
} from '../lessonKit'

/** The lab: the router and its two tags, at the chosen AMP data rates. */
export function ampIntroScenario(rates: { dlKbps: 250 | 1000; ulKbps: 250 | 1000 }): Scenario {
  return sc(oneRoom(), [
    ampAp('ap', 'Router', 5, 4, rates),
    tag('tag-1', 'Fridge tag', 3, 4),
    tag('tag-2', 'Door tag', 8, 6),
  ])
}

export const ampIntro: Lesson = {
  id: 'amp-intro',
  module: 7,
  title: { en: 'A station that never contends', zh: '一种从不竞争信道的“终端”' },
  body: [
    { text: {
      en: 'IEEE P802.11bp is a draft, not a standard: D0.5 appeared in May 2026, D1.0 goes to letter ballot in September 2026. This module follows three documents — the TGbp Specification Framework 11-24/1613r20, frozen in July 2026, and two proposed-draft-text contributions: 11-26/1519r5 (triggering procedure) and 11-26/1889r4 (uplink channel access). Where the draft leaves a value TBD the simulator picks one and labels it: the tag’s −72 dBm downlink sensitivity, the OOK SINR thresholds (8 dB down, 10 dB up at 250 kb/s) and several AMP field widths are model choices, not standard values.',
      zh: 'IEEE P802.11bp 目前还是草案，不是标准：D0.5 于 2026 年 5 月发布，D1.0 将在 2026 年 9 月进入 letter ballot。本模块依据三份文件建模——2026 年 7 月定稿的 TGbp 规范框架 11-24/1613r20，以及两份提案草案文本：11-26/1519r5（触发过程）与 11-26/1889r4（上行信道接入）。草案里仍标 TBD 的数值由仿真器自行选定并标注：标签 −72 dBm 的下行灵敏度、OOK 的 SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）以及若干 AMP 字段宽度，都是模型取值，而非标准值。',
    } },
    { heading: { en: 'Why a battery-free radio cannot run CSMA', zh: '为什么无电池的射频跑不了 CSMA' }, text: {
      en: 'Everything in this course so far rests on one assumption: a station can listen. Carrier sense needs a receiver running continuously, a NAV kept up to date from every Duration field it decodes, a contention window and a clock good enough to count 9 µs slots. An ambient-power tag harvests microwatts; it has an envelope detector instead of a receiver chain and no reliable notion of time between frames. So P802.11bp takes the decision away from it: an Active Tx non-AP AMP STA transmits only inside a slot an AMP triggering frame has just allocated (11-26/1889r4 §39.4). No NAV, no contention window, no backoff — scheduling has moved into the AP.',
      zh: '本课程此前的一切都建立在一个前提上：终端能“听”。载波侦听意味着一条持续工作的接收链路、一个根据每个解出的 Duration 字段实时维护的 NAV、一个竞争窗口，以及一个精确到能数 9 µs 时隙的时钟。而环境能量标签只能收获几十微瓦的能量，它用的是包络检波器而不是完整接收机，两帧之间也没有可靠的时间概念。于是 P802.11bp 干脆把决定权收走：Active Tx 非 AP AMP STA 只在 AMP 触发帧刚刚分配给它的时隙里发送（11-26/1889r4 §39.4）。没有 NAV、没有竞争窗口、没有退避——调度权整体搬到了 AP 一侧。',
    } },
    { kind: 'list', heading: { en: 'Who is who', zh: '角色表' }, items: [
      { en: 'AMP AP — an ordinary AP that also runs the AMP polling function. Here a Wi-Fi 7 router, because the downlink AMP PPDU carries a U-SIG field.', zh: 'AMP AP——一台同时运行 AMP 轮询功能的普通 AP。这里用 Wi-Fi 7 路由器，因为下行 AMP PPDU 带有 U-SIG 字段。' },
      { en: 'Active Tx non-AP AMP STA — the tag. It generates its own carrier to reply; the backscatter modes are a later slice.', zh: 'Active Tx 非 AP AMP STA——也就是标签。它自己产生载波来回应；反向散射模式属于后续切片。' },
      { en: 'AMP-enabled STA — a normal Wi-Fi station that understands AMP frames; and the energizer, which floods a tag with RF power. Neither is in this scene.', zh: '支持 AMP 的普通终端——能理解 AMP 帧的常规 Wi-Fi 终端；以及 Energizer（供能器），向标签辐射射频能量。本场景中两者都没有。' },
    ] },
    { heading: { en: 'The downlink PPDU: a legacy preamble in front of OOK', zh: '下行 PPDU：OOK 前面挂一段传统前导' }, text: {
      en: 'A tag cannot decode OFDM, and a Wi-Fi radio cannot decode on-off keying. The draft solves both at once. Every downlink AMP PPDU starts with 32 µs of ordinary legacy preamble (L-STF, L-LTF, L-SIG, RL-SIG, U-SIG): every Wi-Fi radio in the room acquires it and defers for the PPDU length its L-SIG announces. Then comes the part the tag uses: 80 µs of AMP-Sync so an envelope detector can find the chip boundaries, an AMP-SIG of two octets (64 µs at 250 kb/s, 16 µs at 1 Mb/s), the Manchester-OOK data octets, a padding field, and the 6 µs signal extension every 2.4 GHz PPDU carries.',
      zh: '标签解不了 OFDM，Wi-Fi 射频也解不了通断键控（OOK）。草案一次解决两个问题。每个下行 AMP PPDU 都以 32 µs 的常规传统前导开头（L-STF、L-LTF、L-SIG、RL-SIG、U-SIG），房间里所有 Wi-Fi 射频都能捕获它，并按 L-SIG 中的长度字段在整个 PPDU 期间保持推迟。接下来才是标签用得上的部分：80 µs 的 AMP-Sync，让包络检波器找准码片边界；两个字节的 AMP-SIG（250 kb/s 时 64 µs，1 Mb/s 时 16 µs）；曼彻斯特 OOK 的数据字节；一个填充字段；以及 2.4 GHz 每个 PPDU 都带的 6 µs 信号扩展。',
    } },
    { kind: 'formula', text: {
      en: 'AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs',
      zh: 'AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs',
    }, note: {
      en: 'The 416 µs is the trigger’s 13 octets at 250 kb/s; the 20 µs is padding. At 1 Mb/s the same frame is 258 µs: only the OOK parts shrink, the 32 + 80 + 6 µs of preamble, sync and extension do not.',
      zh: '其中 416 µs 是触发帧 13 个字节在 250 kb/s 下的时长，20 µs 是填充。同一帧在 1 Mb/s 下是 258 µs：只有 OOK 部分变短，前导、同步与信号扩展那 32 + 80 + 6 µs 一动不动。',
    } },
    { text: {
      en: 'Why padding at all? The tag must demodulate the frame, check it, decide whether the round concerns it and start its transmitter — all within one AMP SIFS. The padding buys that time where it costs only airtime: 20 µs unprotected, 36 µs protected (11-26/1519r5 §39.3.2.2). Only unprotected AMP frames exist in this slice.',
      zh: '为什么要填充？标签必须解调、校验、判断这一轮是否与自己有关，还要启动发射机——而这一切都得在一个 AMP SIFS 之内完成。填充把这段时间加在 PPDU 末尾，那里的代价只有空口时间：非保护帧 20 µs，保护帧 36 µs（11-26/1519r5 §39.3.2.2）。本切片只有非保护的 AMP 帧。',
    } },
    { text: {
      en: 'The uplink is the mirror image and much cheaper: no legacy preamble at all, just 48 chips of AMP-Sync (48 µs at 250 kb/s, 12 µs at 1 Mb/s) and then the octets. Which is why a Wi-Fi station can only energy-detect a tag — there is no preamble to lock on to.',
      zh: '上行正好相反，而且便宜得多：完全没有传统前导，只有 48 个码片的 AMP-Sync（250 kb/s 时 48 µs，1 Mb/s 时 12 µs），然后就是数据字节。这也是为什么 Wi-Fi 终端对标签只能做能量检测：根本没有前导可以锁定。',
    } },
    { kind: 'table', heading: { en: 'The three AMP frames', zh: '三种 AMP 帧' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'Octets', zh: '字节' }, N('250 kb/s'), N('1 Mb/s'),
    ], rows: [
      [{ en: 'AMP Trigger (downlink)', zh: 'AMP Trigger（下行）' }, N('13'), N('618 µs'), N('258 µs')],
      [{ en: 'AMP Ack (downlink)', zh: 'AMP Ack（下行）' }, N('4'), N('330 µs'), N('186 µs')],
      [{ en: 'Response with a reading (uplink)', zh: '带读数的回应（上行）' }, N('15'), N('528 µs'), N('132 µs')],
    ] },
    { text: {
      en: 'The response is 15 octets because it carries a sensor reading inline; an identity-only one is 7 octets, which the next lesson uses. At 250 kb/s it is the longest of the three, having no preamble to amortise.',
      zh: '回应之所以是 15 个字节，是因为它把传感器读数直接带在里面；只报身份的回应是 7 个字节，下一课会用到。250 kb/s 下它是三者中最长的，因为没有前导可以摊薄开销。',
    } },
    { heading: { en: 'One round, microsecond by microsecond', zh: '一轮轮询，逐微秒展开' }, text: {
      en: 'The AP wins the channel with its AC_BK access function and then owns everything that follows. It sends a non-HT CTS-to-self first — 44 µs at 6 Mb/s plus the band’s 6 µs signal extension, 50 µs in all — whose Duration reserves the rest of the round for every Wi-Fi node that hears it (§10.23.2.8). One SIFS later the trigger goes out. In 2.4 GHz that SIFS is 10 µs, exactly the AMP SIFS the draft specifies (SFD PM-96), so every gap in the round is the same length.',
      zh: 'AP 用它的 AC_BK 接入函数拿下信道，之后的一切都归它掌控。它先发一帧非 HT 的 CTS-to-self——6 Mb/s 下 44 µs，加上本频段的 6 µs 信号扩展，合计 50 µs——其 Duration 为所有能听见它的 Wi-Fi 节点预留出这一轮的剩余时间（§10.23.2.8）。一个 SIFS 之后触发帧发出。2.4 GHz 的 SIFS 正是 10 µs，与草案规定的 AMP SIFS 完全相同（SFD PM-96），因此触发帧之前的间隔和这一轮内部的各个间隔一样长。',
    } },
    { kind: 'table', heading: { en: 'The first round on the AP’s 2.4 GHz lane', zh: 'AP 的 2.4G 泳道上的第一轮' }, head: [
      { en: 'What', zh: '内容' }, { en: 'From', zh: '起' }, { en: 'To', zh: '止' }, { en: 'Who', zh: '谁' },
    ], rows: [
      [{ en: 'CTS-to-self, Duration 4140 µs', zh: 'CTS-to-self，Duration 4140 µs' }, N('0 µs'), N('50 µs'), { en: 'Router', zh: 'Router' }],
      [{ en: 'AMP Trigger, 4 slots × 528 µs', zh: 'AMP Trigger，4 个时隙 × 528 µs' }, N('60 µs'), N('678 µs'), { en: 'Router', zh: 'Router' }],
      [{ en: 'Slot 1 — response', zh: '时隙 1——回应' }, N('688 µs'), N('1216 µs'), { en: 'Door tag', zh: 'Door tag' }],
      [{ en: 'AMP Ack₁', zh: 'AMP Ack₁' }, N('1226 µs'), N('1556 µs'), { en: 'Router → Door tag', zh: 'Router → Door tag' }],
      [{ en: 'Slot 2 — response', zh: '时隙 2——回应' }, N('1566 µs'), N('2094 µs'), { en: 'Fridge tag', zh: 'Fridge tag' }],
      [{ en: 'AMP Ack₂', zh: 'AMP Ack₂' }, N('2104 µs'), N('2434 µs'), { en: 'Router → Fridge tag', zh: 'Router → Fridge tag' }],
      [{ en: 'Slot 3 — silence', zh: '时隙 3——无人' }, N('2444 µs'), N('2972 µs'), { en: '—', zh: '—' }],
      [{ en: 'AMP Ack₃', zh: 'AMP Ack₃' }, N('2982 µs'), N('3312 µs'), { en: 'Router → Router', zh: 'Router → Router' }],
      [{ en: 'Slot 4 — silence', zh: '时隙 4——无人' }, N('3322 µs'), N('3850 µs'), { en: '—', zh: '—' }],
      [{ en: 'AMP Ack₄', zh: 'AMP Ack₄' }, N('3860 µs'), N('4190 µs'), { en: 'Router → Router', zh: 'Router → Router' }],
    ] },
    { text: {
      en: 'Every gap there is 10 µs. Slot 1 opens one AMP SIFS after the trigger’s last symbol, at 678 + 10 = 688 µs; every later slot opens one AMP SIFS after the previous Ack stops, so slot 2 starts at 1556 + 10 = 1566 µs. That is the draft’s design, not an implementation shortcut: a tag’s clock cannot count off four slot boundaries on its own, so the Acks are the clock. A tag that misses one loses the round.',
      zh: '表里每一个间隔都是 10 µs。时隙 1 在触发帧最后一个符号之后一个 AMP SIFS 打开，即 678 + 10 = 688 µs；此后每个时隙在前一帧 Ack 结束后一个 AMP SIFS 打开，所以时隙 2 从 1556 + 10 = 1566 µs 开始。这是草案有意的设计，不是实现上的偷懒：标签的时钟无法自行数完四个时隙边界，于是 Ack 就是时钟。漏掉一帧 Ack 的标签，就丢掉这一轮。',
    } },
    { kind: 'formula', text: {
      en: 'round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 4.19 % of 100 ms',
      zh: 'round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 100 ms 的 4.19 %',
    }, note: {
      en: 'Of those 4190 µs only 3044 µs is PPDU actually on the air. 90 µs is the nine SIFS gaps, and 1056 µs is the two slots nobody used — the price of random access, paid whether or not anyone turns up.',
      zh: '这 4190 µs 里，真正有 PPDU 在空中的只有 3044 µs。90 µs 是九个 SIFS 间隔，1056 µs 是两个没人用的时隙——这是随机接入的代价，无论有没有人来都照付。',
    } },
    { heading: { en: 'Protecting the round, and who ignores it', zh: '保护这一轮，以及谁会无视它' }, text: {
      en: 'The CTS-to-self carries a Duration of 4140 µs. It ends at 50 µs, so the NAV expires at 4190 µs — the very microsecond the fourth Ack stops transmitting. That NAV is the only thing standing between a tag’s 528 µs of OOK and a Wi-Fi station that cannot even detect it as a frame; the coexistence lesson turns it off and counts the damage. The tags ignore the CTS — they have no NAV to set.',
      zh: 'CTS-to-self 的 Duration 是 4140 µs。它在 50 µs 结束，因此 NAV 在 4190 µs 到期——正是第四帧 Ack 停止发送的那一微秒。这个 NAV 是标签那 528 µs 的 OOK 信号与“连帧都检测不到”的 Wi-Fi 终端之间唯一的屏障；共存那一课会把它关掉，数一数损失有多大。标签则完全无视这帧 CTS——它根本没有 NAV 可设。',
    } },
    { heading: { en: 'A second of polling', zh: '一秒钟的轮询' }, text: {
      en: 'The router starts a round every 100 ms on the dot, so one second holds ten rounds: forty slots, forty Acks, twenty tag responses. Sixteen Acks name a tag; twenty-four name the router itself, which is what an Ack for an empty or unreadable slot carries. Each tag answers in all ten rounds — eight acknowledged, two lost.',
      zh: '路由器每 100 ms 整点开启一轮，因此一秒钟里有十轮：四十个时隙、四十帧 Ack、二十次标签回应。其中十六帧 Ack 点名了某个标签，二十四帧写的是路由器自己——空时隙或解不出的时隙，Ack 里填的就是 AP 自己的标识。两个标签都在全部十轮里作了回应；各有八次被确认、两次丢失。',
    } },
    { text: {
      en: 'The losses are not weak signal. ACWE 2 makes ACW = 2² − 1 = 3, so each tag draws an ABOC uniformly from 0, 1, 2, 3 and transmits in slot ABOC + 1. With four slots on offer every draw maps to a real slot, so neither tag ever sits a round out here; that starts only when ACW exceeds the slot count — the next lesson. What does happen is that twice in ten rounds both tags draw the same number: they collide in slot 1 at 201 216 µs and in slot 3 at 502 972 µs. The AP records a collision, the closing Ack names the router, and each tag learns at 201 556 µs and 503 312 µs that its reading never arrived.',
      zh: '丢失并不是因为信号弱。ACWE 为 2，所以 ACW = 2² − 1 = 3，每个标签从 0、1、2、3 中均匀抽一个 ABOC，并在第 ABOC + 1 个时隙发送。可选时隙恰好是四个，因此每次抽取都能落到一个真实时隙上，这里谁也没有“空转”过一轮；只有当 ACW 超过时隙数时才会空转，那是下一课的内容。真正发生的是：十轮里有两轮两个标签抽到了同一个数——201 216 µs 在时隙 1 相撞，502 972 µs 在时隙 3 相撞。AP 记录一次碰撞，收尾的那帧 Ack 写的是路由器自己；两个标签分别在 201 556 µs 和 503 312 µs 得知自己的读数没有送达。',
    } },
    { text: {
      en: 'Nothing else in a tag’s records looks like a station. Over the whole second neither tag emits one CCA_BUSY, NAV_SET, BACKOFF_DRAW or IFS_START record — it has none of those things to record. Its entire contribution to the timeline is ten transmissions. The router’s lane, on the same channel, is full of all four.',
      zh: '标签的记录里再没有任何一处像一台“终端”。整整一秒里，两个标签都没有产生哪怕一条 CCA_BUSY、NAV_SET、BACKOFF_DRAW 或 IFS_START 记录——它没有载波侦听、没有 NAV、没有竞争窗口，自然无从记录。它对整条时间线的全部贡献就是十次发送。而同一信道上路由器的泳道里，这四类记录一应俱全。',
    } },
    { heading: { en: 'The link budget has enormous margin', zh: '链路预算余量极大' }, text: {
      en: 'The router reaches the Door tag at −43.9 dBm, 28.1 dB above the −72 dBm a tag needs here. The tag transmits at 0 dBm against the router’s 20 dBm, and its reply still arrives at −63.9 dBm, 30.1 dB above the AP’s −94 dBm floor for a 250 kb/s OOK response. Ambient power buys that margin with data rate: slow on-off keying is worth tens of dB against OFDM at the same power.',
      zh: '路由器到 Door tag 的下行为 −43.9 dBm，比标签所需的 −72 dBm 高出 28.1 dB。标签以 0 dBm 发送（路由器是 20 dBm），回应到达时仍有 −63.9 dBm，比 AP 接收 250 kb/s OOK 回应的 −94 dBm 底线高 30.1 dB。环境能量用数据率换来余量：同功率下，低速通断键控比 OFDM 多出几十 dB。',
    } },
    { kind: 'list', heading: { en: 'Where to read it', zh: '在哪里看' }, items: [
      { en: 'The log prints “ABOC 1 of [0, 3] → slot 2”, “AMP round (random): 4 slots × 528.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s” and “slot 1: acknowledged”.', zh: '日志会打印“ABOC 1 of [0, 3] → slot 2”、“AMP round (random): 4 slots × 528.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s”与“slot 1: acknowledged”。' },
      { en: 'Frame detail of the trigger shows its 6-octet body as “Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”.', zh: '触发帧的帧详情把它 6 个字节的帧体显示为“Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”。' },
      { en: 'An Ack’s two-octet ID field holds the tag’s 16-bit identifier (SFD FM-17) — or the AP’s own id when the slot produced nothing.', zh: 'Ack 的帧详情里有一个两字节的 ID 字段，装着标签的 16 位标识（SFD FM-17）——若该时隙什么也没收到，则装着 AP 自己的标识。' },
      { en: 'The inspector shows a tag’s ABOC, ACW, armed slot and sent / acknowledged / lost counts.', zh: '检视器显示标签的 ABOC、ACW、待发时隙，以及已发送 / 已确认 / 已丢失的计数。' },
    ] },
  ],
  scenario: () => ampIntroScenario({ dlKbps: 250, ulKbps: 250 }),
  variants: [
    {
      label: { en: '1 Mb/s both ways', zh: '上下行都用 1 Mb/s' },
      scenario: () => ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 }),
    },
  ],
  jumps: [
    J('first CTS-to-self', '第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts')),
    J('first AMP Trigger', '第一帧 AMP Trigger', firstAmpTrigger),
    J('first tag response', '标签的第一次回应', firstAmpResp),
    J('first Ack naming a tag', '第一帧点名标签的 AMP Ack', firstAmpAckToTag),
    J('first Ack for an empty slot', '第一帧“空时隙”的 AMP Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
    J('first lost response (two tags, one slot)', '第一次回应丢失（两个标签挤进同一时隙）', firstAmpLost),
  ],
  observe: [
    { en: 'Jump to the first AMP Trigger and zoom in until the strip shows tens of microseconds. Every gap is 10 µs: trigger end 678 µs → slot 1 at 688 µs, Ack₁ end 1556 µs → slot 2 at 1566 µs. Every boundary is an Ack plus one AMP SIFS.', zh: '跳到第一帧 AMP Trigger，把时间条放大到能看清几十微秒。所有间隔都是 10 µs：触发帧 678 µs 结束 → 时隙 1 在 688 µs 开始，Ack₁ 1556 µs 结束 → 时隙 2 在 1566 µs 开始。没有任何“浮动”，每个边界都是一帧 Ack 加一个 AMP SIFS。' },
    { en: 'Open the Ack at 1226 µs in frame detail: its ID field is two octets and names the Door tag. Then open the one at 2982 µs, closing an empty slot — same 330 µs PPDU, same four octets, but the ID field carries the router’s own identifier.', zh: '在帧详情里打开 1226 µs 那帧 Ack：ID 字段两个字节，点名的是 Door tag。再打开 2982 µs 那一帧，它收尾的是一个空时隙——同样 330 µs 的 PPDU、同样四个字节，但 ID 字段里装的是路由器自己的标识。' },
    { en: 'Select the Fridge tag and step through one round in the inspector: ABOC and ACW appear the instant the trigger decodes, the slot number follows, and after its Ack the acknowledged counter moves. Every contention field a station would show is absent.', zh: '选中 Fridge tag，在检视器里单步走完一轮：触发帧一解出，ABOC 与 ACW 立刻出现，随后是时隙号；等它的 Ack 到达，“已确认”计数加一。两轮之间，普通终端会显示的那些竞争字段在这里干脆就不存在。' },
  ],
  tryThis: [
    { en: 'Load the 1 Mb/s variant and jump to the first trigger. It now ends at 318 µs and slot 1 opens at 328 µs; the round is 1670 µs instead of 4190 µs, 1.67 % of each 100 ms instead of 4.19 %. Work out from the frame table why the saving is not four-fold, then check the CTS Duration: 1620 µs.', zh: '载入 1 Mb/s 变体，再跳到第一帧触发帧。它现在在 318 µs 结束，时隙 1 在 328 µs 打开；整轮从 4190 µs 缩到 1670 µs，占每 100 ms 的比例从 4.19 % 降到 1.67 %。先用帧长表推一推为什么没能省到四分之一，再核对 CTS 的 Duration：它应当是 1620 µs。' },
    { en: 'In the editor raise the Door tag’s downlink sensitivity threshold above the −43.9 dBm it actually receives, and reload. It stops decoding triggers, so it never draws an ABOC and never transmits — while the round, its four slots and its four Acks carry on unchanged.', zh: '在编辑器里把 Door tag 的下行灵敏度门限抬到高于它实际收到的 −43.9 dBm，然后重新载入。它将解不出触发帧，于是既不抽 ABOC 也不发送——而这一轮本身、它的四个时隙和四帧 Ack 照旧一丝不变。' },
  ],
  quiz: [
    {
      q: { en: 'Why does P802.11bp give the tag a slot instead of letting it contend?', zh: 'P802.11bp 为什么给标签分配时隙，而不是让它去竞争信道？' },
      options: [
        { en: 'Contention would be unfair to Wi-Fi stations', zh: '竞争对 Wi-Fi 终端不公平' },
        { en: 'Carrier sense needs a continuously running receiver, a NAV and a usable clock, and an ambient-power tag has none of them', zh: '载波侦听需要持续运行的接收机、NAV 和可用的时钟，而环境能量标签三者皆无' },
        { en: 'A Wi-Fi radio cannot detect OOK', zh: 'Wi-Fi 射频检测不到 OOK 信号' },
      ],
      answer: 1,
      explain: { en: 'The tag has an envelope detector and microwatts of harvested power. In a whole second it emits no CCA, NAV or backoff record at all.', zh: '标签只有一个包络检波器和几十微瓦的收获功率。整整一秒里，它没有产生任何 CCA、NAV 或退避记录。' },
    },
    {
      q: { en: 'What is the 20 µs padding field at the end of a trigger for?', zh: '触发帧末尾那 20 µs 的填充字段是做什么的？' },
      options: [
        { en: 'Padding to an OFDM symbol boundary', zh: '把帧补齐到 OFDM 符号边界' },
        { en: 'Giving the tag time to demodulate, check and answer within one 10 µs AMP SIFS', zh: '给标签留出时间，让它在一个 10 µs 的 AMP SIFS 内完成解调、校验并回应' },
        { en: 'Letting Wi-Fi stations finish setting their NAV', zh: '让 Wi-Fi 终端有时间设置好 NAV' },
      ],
      answer: 1,
      explain: { en: 'The response is due one AMP SIFS — 10 µs — after the trigger’s last symbol. Padding adds that processing time where it costs only airtime: 20 µs unprotected, 36 µs protected.', zh: '回应必须在触发帧最后一个符号之后一个 AMP SIFS——也就是 10 µs——发出。填充把处理时间加在 PPDU 末尾，那里的代价只有空口时间：非保护 20 µs，保护 36 µs。' },
    },
    {
      q: { en: 'An AMP Ack carries four octets, yet its PPDU lasts 330 µs at 250 kb/s. Where does the time go?', zh: 'AMP Ack 只有四个字节，它的 PPDU 在 250 kb/s 下却要 330 µs。时间花到哪里去了？' },
      options: [
        { en: 'Four octets at 250 kb/s really do take 330 µs', zh: '四个字节在 250 kb/s 下确实就要 330 µs' },
        { en: 'The four octets are 128 µs; the other 202 µs is legacy preamble, AMP-Sync, AMP-SIG, padding and signal extension', zh: '四个字节占 128 µs；其余 202 µs 是传统前导、AMP-Sync、AMP-SIG、填充和信号扩展' },
        { en: 'The Ack is padded to the length of the slot it closes', zh: 'Ack 被补齐到了它所收尾的那个时隙的长度' },
      ],
      answer: 1,
      explain: { en: 'Fixed overhead dominates a tiny frame — which is also why the round costs 4190 µs while only 3044 µs of it is PPDU.', zh: '对极小的帧来说，固定开销占主导。这也解释了为什么整轮要花 4190 µs，而其中真正有 PPDU 的只有 3044 µs。' },
    },
  ],
}
