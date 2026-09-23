/**
 * Wi-Fi Tier 1 · M2 · Channel access · Hidden nodes & RTS/CTS.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): two
 * stations that cannot hear each other but both reach the access point, why
 * listening first does not save them, and then the short question-and-
 * permission exchange that does. The asymmetry table (what the far station
 * hears of the near one's exchange) and the two variants' collision counts
 * live in `numbers`; the stragglers that survive the cure live in `deeper`.
 *
 * This lesson owns RTS and CTS in the readability programme's owner table, so
 * nav's old "RTS/CTS Duration" material lands here.
 *
 * Every number quoted below is pinned in tests/course/hidden.test.ts. The
 * scenario builder and its variant are unchanged, so the recorded timeline
 * hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 */
import { type Lesson, N, hallwayHouse, node, sc, firstCollision, J } from '../lessonKit'

export const hidden: Lesson = {
  id: 'hidden',
  module: 1,
  title: { en: 'Hidden nodes & RTS/CTS', zh: '隐藏节点与 RTS/CTS' },
  why: {
    en: 'Listening before you talk only works if you can hear everyone in the room. Put two stations (STA) at opposite ends of a house, with the access point (AP) in the hallway between them, and each one reaches the access point easily while hearing nothing at all of the other. Both then find the air clear at the same moment, and their frames meet and die where the access point is sitting. Waiting longer cannot fix it. Asking out loud can.',
    zh: '“先听再说”这条规矩，前提是你听得见屋里每一个人。把两台站点（STA）放在房子的两头，接入点（AP）摆在中间的走廊上：两台站点都能轻松够到接入点，却完全听不见对方。于是它们会在同一时刻都判定空口是干净的，两股信号在接入点那里相遇、同归于尽。再多等一会儿也治不了这件事，但“把请求大声说出来”可以。',
  },
  outcomes: [
    { en: 'say why listening before sending fails when two stations cannot hear each other', zh: '说清为什么两台站点互相听不见时，“先听再说”就失灵了' },
    { en: 'read a collision off the timeline and name the two frames that met', zh: '在时间轴上读出一次碰撞，并说出相撞的是哪两帧' },
    { en: 'explain how a short question and a short answer protect a long frame', zh: '解释一问一答两个小帧，怎么保护得住一个长帧' },
    { en: 'compare the collision counts of the same scene with the exchange off and on', zh: '对比同一场景在关闭与开启该交互时的碰撞次数' },
  ],
  needs: ['backoff', 'nav'],
  terms: [
    { term: 'hidden node', plain: {
      en: 'a station on the same network whose transmissions you cannot hear at all, so your listening never reports it',
      zh: '同一个网络里的一台站点，它发的东西你根本听不见，所以你的侦听永远报不出它',
    } },
    { term: 'RTS', plain: {
      en: 'request to send: a tiny frame asking for the air before a long one, addressed to the receiver',
      zh: '请求发送：长帧之前先发的一个很小的帧，向接收方讨一段空口',
    } },
    { term: 'CTS', plain: {
      en: 'clear to send: the receiver’s tiny answer granting it, heard by everyone the receiver can reach',
      zh: '允许发送：接收方回的那个很小的帧，表示“可以”，凡是接收方够得到的人都听得见',
    } },
    { term: 'RTS threshold', plain: {
      en: 'the frame size above which a station asks first instead of simply sending',
      zh: '一个帧长门限，超过它的帧要先问一句，而不是直接就发',
    } },
  ],
  picture: [
    { heading: { en: 'Two rooms and a hallway', zh: '两个房间，一条走廊' }, text: {
      en: 'The access point stands in the hallway, one wall from each end room, and a station sits in each room. Both stations reach it without trouble. Between the two stations, though, stand two brick walls, and what arrives at the far antenna is weaker than the level a radio will call a signal at all. They share one network and one channel, and to each other each of them is a node that cannot be heard — that is a hidden node: not quiet, simply inaudible.',
      zh: '接入点站在走廊上，与两端的房间各隔一堵墙，每个房间里放一台站点。两台站点够到它都毫不费力。可两台站点之间隔着两堵砖墙，传到对方天线上的能量，比无线电愿意称之为“信号”的那条线还要低。它们共用一个网络、一条信道，而对方在自己耳朵里根本不存在——这就是隐藏节点：不是安静，是压根听不见。',
    } },
    { heading: { en: 'Why listening does not save you', zh: '为什么“先听”救不了你' }, text: {
      en: 'Each station does exactly what it was told: listen, and start only when the air is clear. That is enough when everyone can hear everyone. Here it is not. One station is half-way through a long frame; the other hears nothing, decides the channel is free, and begins. The two frames overlap at the access point, which hears both, and both are lost. A wider backoff window does not help: the two never see each other to compete with.',
      zh: '两台站点都严格照章办事：先听，空口干净了才开口。当所有人都听得见所有人时，这就够了。在这里却不够。一台站点的长帧才发到一半，另一台什么也没听见，断定信道是空的，于是开始发送。两帧在接入点处叠在一起——它两边都听得见——于是双双报废。把退避窗口开得更大也没用：两者根本看不见彼此，谈何相让。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Watch two frames meet', zh: '看两帧撞在一起' }, text: {
      en: 'Load the simulation and jump to the first collision. Step backwards from it: neither station froze its counter inside the other’s frame, because there was nothing for either of them to hear.',
      zh: '载入仿真，跳到第一次碰撞。从那里往回走：两台站点谁的计数器都没有在对方的帧里冻结过，因为它们根本没有什么可听的。',
    } },
    { heading: { en: 'Ask first, and be answered out loud', zh: '先问一句，让对方大声回答' }, text: {
      en: 'The cure is to let the access point speak on your behalf. Before a long frame, a station sends a tiny request for the air; that is the RTS. The access point answers with an equally tiny permission to go ahead — that is the CTS — and because the access point is the one speaking, both rooms hear it. The CTS carries a Duration covering the rest of the exchange, so the hidden station loads a NAV and stays quiet for all of it.',
      zh: '解法是让接入点替你说话。发长帧之前，站点先发一个很小的帧，讨要一段空口，这就是 RTS。接入点回一个同样小的帧表示“可以”，这就是 CTS；由于说话的是接入点，两个房间都听得见。这个 CTS 带着一个覆盖本次交互剩余部分的 Duration，于是那台隐藏的站点装上 NAV，整段时间都安静下来。',
    } },
    { kind: 'watch', heading: { en: 'Watch a reservation land in the far room', zh: '看预约落进另一个房间' }, text: {
      en: 'Switch to the protected variant and press play. Watch the far station’s lane: an answer it had no part in arrives, and a reservation appears beneath it that lasts until the exchange is over.',
      zh: '切到受保护的那个变体，按播放。盯着远端站点的泳道：一个与它毫无关系的回答传了过来，它下方随即出现一条预约，一直管到这次交互结束。',
    } },
    { heading: { en: 'Now it is the question that collides', zh: '现在撞的是那句“请问”' }, text: {
      en: 'Two hidden stations can still ask at the same instant, and then it is the two questions that collide. But a question is a couple of dozen bytes where a data frame is well over a thousand, so the room loses a flicker instead of a whole turn. That is the trade: every long frame pays for a short question and a short answer, and what still goes wrong is cheap. The frame size at which a station starts paying — that is the RTS threshold.',
      zh: '两台隐藏的站点当然还可能同时开口发问，那时相撞的就是两句“请问”。可一句“请问”只有几十个字节，而一个数据帧一千多字节，于是房间损失的只是一闪，而不是一整轮。这就是那笔交易：每个长帧都要为一问一答买单，而剩下那些出岔子的事都很便宜。从多大的帧开始买单，由 RTS 门限决定。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'What the far station hears of a whole exchange', zh: '整场交互里，远端站点听得见什么' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'When', zh: '何时' }, { en: 'Walls', zh: '隔墙' }, { en: 'What the far station does', zh: '远端站点的反应' },
    ], rows: [
      [{ en: 'The near station’s 1528-byte data frame', zh: '近端站点的 1528 字节数据帧' }, N('1.95 – 2.31 ms'), { en: 'Two', zh: '两堵' },
        { en: 'Counts straight through it — 106, 105, … 66 — and on through the gap after it', zh: '径直数了过去——106、105、……66——连它之后的那段间隙也一并数完' }],
      [{ en: 'The access point’s ACK', zh: '接入点的 ACK' }, N('2325 – 2353 µs'), { en: 'One', zh: '一堵' },
        { en: 'Freezes at 64, sits out the 28 µs ACK and a 34 µs wait, resumes at 64 at 2387 µs', zh: '在 64 冻结，熬完 28 µs 的 ACK 和 34 µs 的等待，于 2387 µs 从 64 继续' }],
    ] },
    { heading: { en: 'A freeze that guards nothing', zh: '一次什么也没守住的冻结' }, text: {
      en: 'That answer is the last frame of the exchange, so it has nothing left to announce: its Duration is zero and no timer is set anywhere. Moments later the near station starts its next frame and the far one, deaf again, counts straight through it. This is precisely the hole the protected variant fills — there the access point speaks first, and what it announces is the whole exchange still to come.',
      zh: '那个回答是本次交互的最后一帧，已经没有什么可预告的了：它的 Duration 是零，任何人都不会因此挂起计时器。片刻之后近端站点开始下一帧，重新“失聪”的远端又径直数了过去。受保护的那个变体补的正是这个洞——在那里接入点先开口，而它预告的是整场尚未开始的交互。',
    } },
    { kind: 'table', heading: { en: 'Three hundred milliseconds, with the exchange off and on', zh: '同样的 300 ms，关与开' }, head: [
      { en: 'Counted over 300 ms', zh: '300 ms 内的统计' }, { en: 'Off', zh: '关' }, { en: 'On', zh: '开' },
    ], rows: [
      [{ en: 'Collisions', zh: '碰撞次数' }, N('126'), N('32')],
      [{ en: 'Of those, ones that caught a data frame', zh: '其中撞上数据帧的' }, N('126'), N('7')],
      [{ en: 'Data frames delivered', zh: '成功送达的数据帧' }, N('45'), N('329')],
    ] },
    { heading: { en: 'What the question costs and what it buys', zh: '这句“请问”的成本与收益' }, text: {
      en: 'Turning the exchange on cuts the collisions that catch a data frame by about 94%. Every long frame now pays for a 20-byte question and a 14-byte answer before it may start — and the room delivers seven times as many frames as it did without them.',
      zh: '把这套交互打开，撞上数据帧的碰撞减少了约 94%。此后每个长帧开始发送之前，都要先为一个 20 字节的提问和一个 14 字节的回答买单——而整个房间送达的帧数，是不用它们时的七倍。',
    } },
    { kind: 'steps', heading: { en: 'One protected exchange, step by step', zh: '一次受保护的交互，一步一步' }, items: [
      { en: 'A station adds up the frame it is about to send: payload, a 24-byte header, a 4-byte checksum. Above the RTS threshold — 500 bytes in the protected variant — it asks first.',
        zh: '站点先把要发的那一帧加起来：载荷、24 字节帧头、4 字节校验。总数高过 RTS 门限——受保护的变体里是 500 字节——它就先问一句。' },
      { en: 'The question is an RTS of 20 bytes to the access point. Its Duration field reserves the three short gaps, the answer, the data frame and the acknowledgement, counted from the end of the RTS.',
        zh: '这句提问是一个 20 字节的 RTS，发给接入点。它的 Duration 字段预约下三个短间隔、那个回答、那一帧数据和确认，起算点是 RTS 结束的那一刻。' },
      { en: 'Only the radios that hear this station hear the question. Across the house it arrives under the level at which a radio calls something a signal, so the other room hears nothing and keeps counting.',
        zh: '这句提问只有听得见这台站点的电台才收得到。它穿过房子到对面时，已低于电台肯认作信号的那条线，于是另一个房间什么也没听见，照旧往下数。' },
      { en: 'One 16 µs gap later the access point answers with a CTS of 14 bytes. Its Duration is the time the RTS asked for, less that gap and less the CTS itself. The answer leaves the hallway, which both end rooms hear.',
        zh: '隔 16 µs 之后，接入点回一个 14 字节的 CTS。它的 Duration，是 RTS 讨要的那段时间减去这个间隔、再减去 CTS 自己。回答是从走廊发出的，两头的房间都听得见。' },
      { en: 'A station hearing a frame addressed to somebody else takes that frame’s end, adds the Duration it carries and sets its NAV there, if that lands later than the NAV it holds. The far station freezes its counter.',
        zh: '站点收到不是发给自己的帧，就拿这一帧的结束时刻加上帧里的 Duration，把 NAV 设到那里——只要它比手上的 NAV 更晚。远端站点于是把计数器就地冻住。' },
      { en: 'The data frame and the acknowledgement run inside that reservation, which expires on the microsecond the acknowledgement ends. The far station waits one DIFS and counts on from the number it froze at.',
        zh: '数据帧与确认帧都跑在这段预约里，而预约到期的那一微秒，正是确认帧结束的那一微秒。远端站点等满一个 DIFS，从冻结时的那个数接着数。' },
    ] },
    { kind: 'table', heading: { en: 'The exchange that starts at 718 µs, value by value', zh: '718 µs 那次交互，逐个数值走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'the frame Hidden A is holding', zh: 'Hidden A 手上那一帧' }, N('1500 + 24 + 4 = 1528 B')],
      [{ en: 'against the threshold, so it asks at', zh: '与门限一比，于是发问于' }, N('718 µs · RTS · 20 B')],
      [{ en: 'reserved, from the end of the RTS', zh: '预约的时长，自 RTS 结束起算' }, N('3 × 16 + 28 + 364 + 28 = 468 µs')],
      [{ en: 'the question at Hidden B', zh: '这句提问到 Hidden B 处' }, N('−83.4 dBm < −82 dBm ✗')],
      [{ en: 'so the access point answers at', zh: '于是接入点回答于' }, N('762 µs · CTS · 14 B')],
      [{ en: 'its Duration', zh: '它的 Duration' }, N('468 − 16 − 28 = 424 µs')],
      [{ en: 'the answer at Hidden B', zh: '这个回答到 Hidden B 处' }, N('−60.6 dBm > −82 dBm ✓')],
      [{ en: 'Hidden B freezes at 13 and reserves to', zh: 'Hidden B 在 13 冻结，并预约到' }, N('790 + 424 = 1214 µs')],
      [{ en: 'the acknowledgement ends at', zh: '确认帧结束于' }, N('1214 µs')],
      [{ en: 'Hidden B waits a DIFS and counts on from', zh: 'Hidden B 等一个 DIFS，再从这个数接着数' }, N('1248 µs · 13')],
    ] },
  ],
  deeper: [
    { heading: { en: 'The collisions that survive the cure', zh: '治不掉的那几次碰撞' }, text: {
      en: 'Of the 32 collisions left in the protected run, 25 are a question meeting a question: two hidden stations whose counters reach zero within four slots of each other. A question is twenty bytes, so each of those costs a small fraction of what a ruined data frame costs. The other 7 do catch a data frame — one already under way when somebody else asked. The cure does not make the medium safe; it makes the unsafe moments short.',
      zh: '受保护那一轮剩下的 32 次碰撞里，25 次是“请问”撞上“请问”：两台隐藏站点的计数器，在相隔不到四个时隙的时间里先后归零。一句“请问”只有二十字节，所以这种碰撞的代价，只是报废一个数据帧的很小一部分。另外 7 次确实撞上了数据帧——有人开口发问时，那一帧其实已经在路上了。这套办法并没有让介质变安全，它只是让不安全的时刻变短。',
    } },
    { heading: { en: 'Which frames pay', zh: '哪些帧要买单' }, text: {
      en: 'The variant sets its RTS threshold at 500 bytes, and every data frame in this scene is 1528, so all of them ask first. The unprotected scene is the same scene with the threshold left at 3000 — above every frame in the room, so nothing ever asks. Set it far lower instead and the answers themselves would start asking first, which is why the threshold always sits well above the short frames.',
      zh: '该变体把 RTS 门限设在 500 字节，而本场景里每个数据帧都是 1528 字节，所以它们全都要先问一句。未受保护的那个场景，就是同一个场景把门限留在 3000——高过屋里任何一帧，于是谁也不会发问。反过来把门限调得极低，则连回答自己都要先发问了——这正是门限总要远高于短帧长度的原因。',
    } },
  ],
  sources: [
    { en: 'The RTS/CTS exchange and the rule that a station receiving either one sets its NAV from the frame’s Duration are §10.3.2.9 and §10.3.2.4 of IEEE Std 802.11-2024.',
      zh: 'RTS/CTS 交互，以及“收到其中任何一帧的站点都要按该帧的 Duration 设置 NAV”这条规则，见 IEEE Std 802.11-2024 的 §10.3.2.9 与 §10.3.2.4。' },
    { en: 'The Duration field and its meaning — microseconds measured from the end of the current frame — are §9.2.4.2. The dot11RTSThreshold attribute is Annex C.',
      zh: 'Duration 字段及其含义——从当前帧结束起算、以微秒计的一段时间——见 §9.2.4.2；dot11RTSThreshold 属性见附录 C。' },
    { en: 'The −82 dBm level below which this simulator declares a signal undetectable, the two brick walls and their loss, and every count and timestamp above are the model’s own, reproducible from the scene’s seed rather than taken from the standard.',
      zh: '本仿真器把 −82 dBm 以下判为“检测不到”，两堵砖墙及其损耗，以及上面每一个计数和时刻，都是模型取值，靠场景的随机种子即可复现，并非取自标准正文。' },
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
    node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
  ]),
  variants: [
    {
      label: { en: 'RTS/CTS ON (threshold 500 B)', zh: '开启 RTS/CTS（门限 500 B）' },
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('first collision', '第一次碰撞', firstCollision),
  ],
  observe: [
    { en: 'Base scenario: the red collision ticks never stop — 126 of them in 300 ms, and every single one has a data frame caught in it.', zh: '基础场景：红色的碰撞刻度就没断过——300 ms 里 126 次，而且每一次都夹着一个数据帧。' },
    { en: 'Neither hidden station ever freezes for the other: not one freeze falls inside a frame from the other room. Every freeze either station makes is for an ACK from the access point — the one part of the other’s exchange it can hear, and it arrives after the frame it might have protected.', zh: '两台隐藏站点谁也不会为对方冻结：没有一次冻结落在另一个房间发来的帧里。它们的每一次冻结都是为接入点的 ACK 而停——那是对方整场交互里唯一听得见的部分，而它来得比本可保护的那一帧还晚。' },
    { en: 'Protected variant: after an answer from the access point, the other room’s station shows a reservation running to the end of the exchange — 245 of them in 300 ms.', zh: '受保护变体：接入点一回答，另一个房间的站点就显示出一条一直管到交互结束的预约——300 ms 里有 245 条。' },
  ],
  tryThis: [
    { en: 'Count the collision ticks per 100 ms in both variants (inspector → BSS totals): about 42 with the exchange off, about 11 with it on.', zh: '分别统计两个变体每 100 ms 的碰撞刻度（检视器 → BSS 总览）：关闭时约 42 次，开启时约 11 次。' },
    { en: 'In the editor, punch a door near the top of a hallway wall, on the stations’ line of sight (y ≈ 7.2). The ray between them now crosses one wall instead of two and they hear each other again. A door lower down changes nothing.', zh: '在编辑器里，给走廊的一堵墙靠上端、也就是两台站点连线经过处（y ≈ 7.2）开一扇门。它们之间的射线从此只穿一堵墙，于是又能听见彼此。门开得靠下则毫无作用。' },
  ],
  quiz: [
    {
      q: { en: 'Why does a wider contention window not solve hidden-node collisions?', zh: '为什么把竞争窗口开大解决不了隐藏节点的碰撞？' },
      options: [
        { en: 'Because CW cannot grow past its maximum', zh: '因为 CW 不能超过它的上限' },
        { en: 'Because the two stations never sense each other, so they keep starting inside each other’s frames however long they wait', zh: '因为两台站点根本侦听不到彼此，等多久都照样撞进对方的帧里' },
        { en: 'It does solve it, only slowly', zh: '其实能解决，只是慢' },
      ],
      answer: 1,
      explain: { en: 'A backoff counter only keeps apart the stations that can hear each other transmit. A station you cannot hear is not a station you can take turns with.', zh: '退避计数器只能把“互相听得见”的站点错开。一台你听不见的站点，根本谈不上和你轮流来。' },
    },
    {
      q: { en: 'What makes the receiver’s answer, rather than the sender’s question, the frame that does the work?', zh: '真正起作用的为什么是接收方的回答，而不是发送方的提问？' },
      options: [
        { en: 'It is sent at a higher power', zh: '它用更大的功率发送' },
        { en: 'It comes from the access point, which both hidden stations can hear, and its Duration covers the exchange still to come', zh: '它出自接入点，两台隐藏站点都听得见，而它的 Duration 覆盖了尚未开始的那段交互' },
        { en: 'It is shorter, so it is less likely to be hit', zh: '它更短，所以不容易被撞上' },
      ],
      answer: 1,
      explain: { en: 'The question only reaches the stations the sender can already reach. The answer reaches the ones the sender cannot — which is exactly where the danger was.', zh: '提问只传得到发送方本来就够得着的人；回答传得到的，恰恰是发送方够不着的那些——而危险正藏在那里。' },
    },
  ],
}
