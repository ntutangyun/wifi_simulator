/**
 * Wi-Fi Tier 2 · M7 · Scheduled Wi-Fi 6/7 · the triggered uplink.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why the
 * uplink is the hard direction, what the trigger frame settles on the answering
 * devices' behalf, and what those devices still decide for themselves. `numbers`
 * closes with the engine's own procedure for arranging one triggered round and
 * the first round of the run through it row by row. The clause numbers live in
 * `sources`.
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below is pinned in tests/course/ofdma-ul.test.ts.
 */
import { type Lesson, N, oneRoom, node, sc, firstTrigger, firstMba, J } from '../lessonKit'

export const ofdmaUl: Lesson = {
  id: 'ofdma-ul',
  module: 6,
  title: { en: 'Trigger frames — the access point conducts the uplink', zh: '触发帧——接入点指挥上行' },
  why: {
    en: 'Sending to several devices at once is one radio’s decision to make: it knows what it is sending, so it can cut the channel up as it likes. Receiving from several at once — the uplink, the direction from the devices back towards the box they all talk to — is a different problem. They would have to begin in the same instant, on slices that do not overlap, and arrive at similar strength, and no device can hear what another one is about to do. Somebody has to conduct, only the access point (AP) is in a position to, and the frame it conducts with is called a trigger frame.',
    zh: '同时发给好几台设备，是一台电台自己就能定的事：它知道自己要发什么，想怎么切信道就怎么切。反过来同时从好几台设备那里收——也就是上行，从设备指回它们共同说话的那只盒子的方向——则是另一回事。它们得在同一个瞬间开始，落在互不重叠的片上，到达时强弱还得相近，可谁也听不见别人下一步打算干什么。这就得有人来指挥，而有资格指挥的只有接入点（AP）；它用来指挥的那个帧，就叫作触发帧。',
  },
  outcomes: [
    { en: 'say why several devices cannot arrange a shared uplink send between themselves', zh: '说出几台设备为什么没法自己商量出一次共享的上行发送' },
    { en: 'read a trigger frame and the answers it brings back off the timeline', zh: '在时间轴上读出一个触发帧，以及它带回来的那些回答' },
    { en: 'say what a device stops deciding once it has been triggered, and what it still decides', zh: '说出一台设备被触发之后，哪些事不再由它决定，哪些事仍然由它决定' },
  ],
  needs: ['ofdma-dl'],
  terms: [
    { term: 'uplink', plain: {
      en: 'the direction from a device towards its access point; downlink is the other way',
      zh: '从设备指向接入点的那个方向；反过来就是下行',
    } },
    { term: 'trigger frame', plain: {
      en: 'the short frame an access point sends to say who answers next, on which slice, for how long and how loudly',
      zh: '接入点发出的一个短帧，用来说明：接下来谁来回答、各用哪一片、回答多长、发多大力',
    } },
    { term: 'TB', plain: {
      en: 'trigger-based: a TB PPDU is an answer a device is allowed to send only because a trigger frame asked for it',
      zh: '基于触发：TB PPDU 是一种回答帧，设备只有在触发帧点名要求时才被允许发它',
    } },
  ],
  picture: [
    { heading: { en: 'The hard direction', zh: '难的那个方向' }, text: {
      en: 'Slicing the channel works downwards because one radio fills every slice. Upwards, the slices would be filled by different devices in different corners of the room. They do not share a clock, they cannot hear each other well, and each knows only its own queue. Left to themselves they could never begin together, so the uplink stays one device at a time — unless somebody tells them all exactly what to do.',
      zh: '把信道切片，往下行方向做得通，因为每一片都是同一台电台填的。往上行方向，各片就要由房间不同角落里的不同设备来填。它们不共用一个时钟，彼此也听不太清，各自只知道自己的队列。靠它们自己，永远凑不齐同一个起跑瞬间，于是上行只能一台一台地来——除非有人把该做的事原原本本地告诉每一台。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first trigger frame: a short yellow block from the access point. One gap later both uploaders’ green blocks begin in the very same instant — and end in the very same instant, which is the part worth staring at.',
      zh: '载入仿真，跳到第一个触发帧：接入点发出的一个短短的黄块。隔一小段，两台上传设备的绿块在同一个瞬间一起开始——又在同一个瞬间一起结束，值得多看两眼的正是这后半句。',
    } },
    { kind: 'steps', heading: { en: 'What the trigger frame settles', zh: '触发帧把哪些事定死了' }, items: [
      { en: 'Who answers: the devices it names, and nobody else.', zh: '谁来回答：它点到名的那些设备，别人不许出声。' },
      { en: 'Where: which slice of the channel each one uses, so the answers sit side by side instead of on top of each other.', zh: '在哪儿答：每台各用信道的哪一片，好让几个回答并排落下，而不是叠在一起。' },
      { en: 'How long: every answer is padded out to the same length, so they all finish together and one acknowledgement can cover the lot.', zh: '答多长：每个回答都填充到同样的长度，于是它们一起结束，一个确认就能把整组收掉。' },
      { en: 'How loudly: each device is told to correct its power, so a near one and a far one reach the access point at similar strength — an instruction this simulator writes into the frame but does not act on, so its uploaders answer at their usual power.', zh: '答多响：每台设备都被告知要怎样修正自己的功率，好让近的和远的到达接入点时强弱相近——这条指令本仿真器只写进帧里，并不执行，它的上传设备仍按自己一贯的功率作答。' },
      { en: 'When: one short gap after the trigger frame ends, aligned in time and in frequency to the access point.', zh: '什么时候答：触发帧结束后隔一小段，并且在时间和频率上都对齐到接入点。' },
    ] },
    { heading: { en: 'An answer that decides nothing', zh: '一个什么都不做主的回答' }, text: {
      en: 'What comes back is a TB PPDU: trigger-based, and the one kind of send a device may make only because it was asked. Everything about it was chosen by the access point — the slice, the modulation, the length, the instant. The device supplies the bytes and nothing else. That is the whole trick: simultaneity is impossible to agree on, and easy to dictate.',
      zh: '回来的这一帧叫作 TB PPDU：基于触发，是唯一一种“只因为被要求了才可以发”的发送。关于它的一切都是接入点定的——用哪一片、用哪档调制、发多长、什么时候开始。设备只负责把字节装进去，别的一概不管。诀窍就在这里：要商量出“同时”几乎不可能，要指定“同时”却很容易。',
    } },
    { heading: { en: 'What the devices keep', zh: '设备保住了什么' }, text: {
      en: 'Inside a triggered round nobody counts down a backoff: the turn has already been handed out. Listening does not stop, though — a device still checks the air before it answers and stays quiet if another network has the room. And between rounds nothing is conducted at all: the same two uploaders queue up and contend exactly as they did before, because the access point only triggers when it wants the uplink organised.',
      zh: '在一次被触发的回合里，没有人再去数退避：这一轮的机会早就分配好了。但“听”并没有停——设备在回答前仍然会看一眼空口，如果房间已经被别的网络占着，它就闭嘴。而在两次回合之间，根本没有谁在指挥：还是那两台上传设备，像以前一样排队、一样竞争，因为接入点只在它想把上行组织一下的时候才发触发帧。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'One triggered round, end to end',
      zh: '一次完整的触发回合',
    }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'On the air', zh: '占用空口' }, { en: 'What it carries', zh: '装的是什么' },
    ], rows: [
      [{ en: 'Trigger frame from the access point', zh: '接入点发出触发帧' }, N('36 µs'),
        { en: '40 bytes, sent slowly at 24 Mb/s so every device can read it', zh: '40 字节，用 24 Mb/s 慢慢发，好让每台设备都读得懂' }],
      [{ en: 'Gap', zh: '间隔' }, N('16 µs'), { en: 'the usual pause inside an exchange', zh: '一次交互内部常规的停顿' }],
      [{ en: 'Two TB PPDU answers, side by side', zh: '两个 TB PPDU 并排' }, N('1988.8 µs'),
        { en: '16,894 bytes from each uploader on half the channel each: eleven whole frames and 531 bytes of padding', zh: '每台上传设备 16,894 字节，各占半条信道：十一个完整的帧，外加 531 字节填充' }],
      [{ en: 'Gap', zh: '间隔' }, N('16 µs'), { en: 'the same pause again', zh: '同样的那段停顿' }],
      [{ en: 'One multi-station BlockAck', zh: '接入点发一个多站点 BlockAck' }, N('36 µs'),
        { en: 'both answers acknowledged at once', zh: '一次把两个回答都确认掉' }],
      [{ en: 'The whole round', zh: '整个回合' }, N('2092.8 µs'), { en: '33,788 bytes up', zh: '共上行 33,788 字节' }],
    ] },
    { kind: 'table', heading: {
      en: 'The uplink of two uploaders over 100 ms',
      zh: '两台上传设备 100 ms 内的上行',
    }, head: [
      { en: 'What', zh: '项目' }, { en: 'How many', zh: '次数' }, { en: 'Bytes up', zh: '上行字节' },
    ], rows: [
      [{ en: 'Trigger frames sent', zh: '接入点发出的触发帧' }, N('16'), N('—')],
      [{ en: '…of those, triggers nobody answered', zh: '其中没人回答的' }, N('2'), N('0')],
      [{ en: 'TB PPDU answers that came back', zh: '回来的 TB PPDU' }, N('28'), N('473,032')],
      [{ en: 'Ordinary contended sends', zh: '普通竞争发送' }, N('54'), N('996,756')],
    ] },
    { heading: { en: 'An invitation, not an order', zh: '这是邀请，不是命令' }, text: {
      en: 'About a third of what this pair sent up went in triggered rounds; the rest went the ordinary contended way, colliding six times. Twice a trigger frame brought nothing back — the access point waits out its timeout and takes the air back. Being told exactly what to do is not the same as being made to do it.',
      zh: '这两台设备发上去的东西里，大约三分之一走的是触发回合；其余的走普通竞争的老路，一路上还碰撞了六次。另有两次，触发帧什么也没换回来——接入点只好等到超时，再把空口收回去。被清清楚楚地告知该怎么做，和被迫去做，并不是一回事。',
    } },
    { kind: 'steps', heading: { en: 'Arranging one triggered round, step by step', zh: '一次触发回合是怎么安排出来的，一步一步' }, items: [
      { en: 'A device with something queued upward reports that backlog, and the access point starts contending for a turn of its own.',
        zh: '设备有东西要往上发时，会把这份积压报给接入点；接入点记下“该发触发帧了”，然后开始为自己争一轮。' },
      { en: 'When it wins that turn with nothing of its own queued downward, it lists the devices whose backlog is not empty and that have negotiated OFDMA with it. Fewer than two on that list and it drops the idea for now.',
        zh: '等它赢下这一轮、而自己手上又没有要往下发的东西时，就列出积压非空、并且和它协商过 OFDMA 的设备。名单上不到两台，这件事就先作罢。' },
      { en: 'It keeps the first four, cuts the tones into that many equal resource units, and fixes one format for the whole round: the rung each device may use, and the width every answer occupies — the narrowest any invited device negotiated.',
        zh: '名单上只留前四台，把子载波切成同样多的等分资源单元，再给整个回合定死一套格式：每台可以用哪一级，以及每个回答占多宽——取受邀各台协商过的最窄的那个宽度。' },
      { en: 'For each device it turns the backlog into airtime, capped at what fits a 2 ms answer, and takes the longest of those. Every device is then given that one length, so the answers end together and one acknowledgement can close the round.',
        zh: '接着为每台设备把积压折算成空口时间，上限是一个 2 ms 的回答装得下的量，再取其中最长的那个。然后所有设备都被指定这同一个长度，于是几个回答一起结束，一个确认就能把整个回合收掉。' },
      { en: 'The trigger frame goes out slowly, at 24 Mb/s, so every device in the room can read it: 28 bytes of information common to all, plus 6 more for each device named. Its Duration field covers the gap, the answers, the second gap and the acknowledgement.',
        zh: '触发帧用 24 Mb/s 慢慢发出去，好让屋里每台设备都读得懂：28 字节是给所有人的公共信息，每点一台名再加 6 字节。它的 Duration 字段把那段间隔、那些回答、第二段间隔和最后的确认一起罩住。' },
      { en: 'One 16 µs gap later each named device answers on the resource unit it was given, unless a NAV set by somebody other than this access point is still running. It fills its part up to the bytes that length allows, and pads out the rest.',
        zh: '隔 16 µs，被点到名的每台设备各在分给自己的资源单元上作答——除非此刻还有一条不是这个接入点设下的 NAV 压着。它把这个长度容得下的字节装满，剩下的用填充补齐。' },
      { en: 'Another 16 µs after the answers end together, the access point closes the round with one multi-station BlockAck: 32 bytes plus 8 more for every device after the first. If no answer has begun 45 µs after the trigger frame ended, the round failed and the air is taken back.',
        zh: '几个回答一起结束后再隔 16 µs，接入点发一个多站点 BlockAck 把回合收掉：32 字节，此后每多一台设备再加 8 字节。要是触发帧结束后 45 µs 仍没有任何回答开始，这一回合就什么也没换回来，空口随即被收回。' },
    ] },
    { kind: 'table', heading: { en: 'The first triggered round, run through the steps', zh: '第一次触发回合，照着步骤走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'Devices with a backlog', zh: '有积压的设备' }, N('2')],
      [{ en: 'Share of the tones each', zh: '每台分到的子载波占比' }, N('0.5')],
      [{ en: 'Most bytes that fit a 2 ms answer', zh: '一个 2 ms 的回答最多装得下' }, N('17,425 B')],
      [{ en: 'Symbols for those', zh: '这么多字节要几个符号' }, N('143')],
      [{ en: 'so every answer is given the length', zh: '于是每个回答都被指定为' }, N('44 + 13.6 × 143 = 1988.8 µs')],
      [{ en: 'Trigger frame', zh: '触发帧' }, N('28 + 6 × 2 = 40 B, 36 µs')],
      [{ en: 'Multi-station BlockAck', zh: '多站点 BlockAck' }, N('32 + 8 = 40 B, 36 µs')],
      [{ en: 'The whole round', zh: '整个回合' }, N('36 + 16 + 1988.8 + 16 + 36 = 2092.8 µs')],
    ] },
  ],
  deeper: [
    { heading: { en: 'Why the answers must arrive at similar strength', zh: '几个回答为什么必须强弱相近' }, text: {
      en: 'A receiver listening to two slices at once is one radio with one gain setting and one converter. A very strong signal on one slice raises the noise the receiver makes for itself across all of them, and the weak slice next door is the one that suffers. That is why the trigger frame carries a power correction per device rather than leaving each to shout as loudly as it likes — the near uploader is asked to come down so the far one can be heard. This simulator dictates the slice, the length, the rung and the width but not that correction: its uploaders answer at the power they always use, so the round you watch is the easy case.',
      zh: '同时听两片信号的接收机，只有一套增益、一个转换器。某一片上来了个特别强的信号，接收机自己产生的底噪就会在所有片上一起抬高，而吃亏的正是旁边那片弱的。所以触发帧要逐台携带功率修正，而不是任由各家想喊多响就喊多响——近处那台被要求收着点，远处那台才听得见。本仿真器只指定分片、长度、级别和带宽，并不指定这份功率修正：它的上传设备照自己一贯的功率作答，所以你看到的这个回合是好办的那一种。',
    } },
    { heading: { en: 'Why a group of one is no group', zh: '一个人的“组”不算组' }, text: {
      en: 'Turn the shared-uplink capability off on one of the two uploaders and this room produces no trigger frame at all, not even for the remaining one. The engine’s rule is simply that a triggered round needs at least two members before it will be arranged at all, and the reason is the overhead: the trigger frame, its gap and its acknowledgement have to be earned back by the members who share them.',
      zh: '把两台上传设备中的一台的共享上行能力关掉，这个房间就再也不会发出触发帧了——连为剩下那一台发也不会。引擎的规则很简单：一个触发回合至少要有两个成员，才会被组织起来；道理在开销上——触发帧、那段间隔和那个确认，都得靠分摊它们的成员赚回来。',
    } },
  ],
  sources: [
    { en: 'The Trigger frame, its Common Info and per-user fields (RU allocation, target RSSI, UL length, MCS) are §9.3.1.22 of IEEE Std 802.11-2024; the HE TB PPDU it solicits is Clause 27, and the rule that it may be sent only in response to a Trigger is §26.5.2.',
      zh: '触发帧及其公共信息字段与每用户字段（RU 分配、目标 RSSI、上行长度、MCS）见 IEEE Std 802.11-2024 §9.3.1.22；它所征询的 HE TB PPDU 见第 27 章；“只能用于应答触发帧”这条规则见 §26.5.2。' },
    { en: 'The Multi-STA BlockAck that answers the whole group in one frame is §9.3.1.9.7. The simulator charges it 40 bytes and 36 µs, a single representative value rather than a per-user sum.',
      zh: '用一帧确认整组的多站点 BlockAck 见 §9.3.1.9.7。仿真器给它计 40 字节、36 µs，这是一个代表值，并非按用户逐项相加的结果。' },
    { en: 'That a triggered station may still be required to sense the medium before it answers is the Trigger’s CS Required field (§9.3.1.22.1); this simulator honours it and never counts a backoff inside a triggered round.',
      zh: '被触发的站点在回答前仍可能被要求先侦听介质，这由触发帧的 CS Required 字段规定（§9.3.1.22.1）；本仿真器遵守该字段，并且在触发回合内部从不计退避。' },
    { en: 'The 24 Mb/s the Trigger itself is sent at is the simulator’s choice of a legacy rate every station in the room can decode, not a value the standard fixes.',
      zh: '触发帧本身用 24 Mb/s 发送，是仿真器选定的一个房间里人人都能解调的传统速率，并非标准规定的取值。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
    node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
  ]),
  jumps: [
    J('first trigger frame', '第一个触发帧', firstTrigger),
    J('first multi-station BlockAck', '第一个多站点 BlockAck', firstMba),
  ],
  observe: [
    { en: 'Jump to the first trigger frame: 36 µs of yellow from the access point. One gap later both green blocks begin in the same instant, and both run 1988.8 µs — the length the trigger frame named.', zh: '跳到第一个触发帧：接入点发出的 36 µs 黄块。隔一小段，两个绿块在同一瞬间开始，而且都长 1988.8 µs——正是触发帧指定的那个长度。' },
    { en: 'Hover each green block: the same length and the same 16,894 bytes, though the two uploaders are not the same distance away and their queues are not the same. Neither number came from the device.', zh: '把鼠标分别停在两个绿块上：长度一样，字节数也都是 16,894，可这两台上传设备离得远近不同，队列也不一样。这两个数都不是设备自己定的。' },
    { en: 'One frame answers the pair: a multi-station BlockAck of 36 µs, one gap after both answers end together. Between rounds the conductor is gone — 54 of their sends went up by ordinary contention, against 28 triggered ones.', zh: '一帧就把两个回答都确认了：两个回答一起结束后隔一小段，接入点发出一个 36 µs 的多站点 BlockAck。两次回合之间指挥就不见了——有 54 次发送走的是普通竞争的老路，而被触发的只有 28 次。' },
  ],
  tryThis: [
    { en: 'Open the trigger frame in the frame decoder and read its Duration field: it covers the answers and the acknowledgement as well, so a device that is not in the group stays off the air for the whole round.', zh: '在帧解码器里打开这个触发帧，看它的 Duration 字段：它把后面的回答和确认一起罩住了，于是不在这一组里的设备整个回合都不会上空口。' },
    { en: 'Open in editor and turn OFDMA off on uploader A, then reload. Not one trigger frame goes out — not even for uploader B. A conductor is worth paying for only when there is more than one player.', zh: '点“在编辑器中打开”，关掉上传设备 A 的 OFDMA 再重新载入。一个触发帧也不会发出来——连为上传设备 B 发都不会。只有演奏者不止一个，请指挥才划算。' },
  ],
  quiz: [
    {
      q: { en: 'Why can’t two devices arrange a shared uplink send between themselves?', zh: '两台设备为什么没法自己商量着完成一次共享的上行发送？' },
      options: [
        { en: 'Their radios cannot transmit on part of a channel', zh: '它们的电台没法只在信道的一部分上发射' },
        { en: 'Nothing gives them a common instant, a common length or non-overlapping slices — and they cannot hear each other’s plans', zh: '没有任何东西能给它们一个共同的起始瞬间、一个共同的长度和互不重叠的分片——而且它们也听不见对方的打算' },
        { en: 'Regulations forbid two devices from transmitting at once', zh: '法规禁止两台设备同时发射' },
      ],
      answer: 1,
      explain: { en: 'Simultaneity cannot be agreed on between equals who cannot hear each other. It can be dictated by the one device that hears them all, which is what the trigger frame does.', zh: '在彼此听不见的平等者之间，“同时”是商量不出来的。但它可以由那台谁都听得见的设备指定下来，触发帧干的就是这件事。' },
    },
    {
      q: { en: 'One uploader has far less queued than the other. What does its TB PPDU look like?', zh: '有一台上传设备排队的东西比另一台少得多。它的 TB PPDU 会是什么样子？' },
      options: [
        { en: 'Shorter, so the round finishes sooner', zh: '更短，于是整个回合结束得更早' },
        { en: 'The same length, with the rest padded out — the answers have to end together', zh: '长度一样，剩下的部分用填充补齐——几个回答必须一起结束' },
        { en: 'It is not allowed to answer at all', zh: '它根本不被允许回答' },
      ],
      answer: 1,
      explain: { en: 'The trigger frame names one length for everybody. Ending together is what lets a single acknowledgement cover the group, and it is what the padding is buying.', zh: '触发帧给所有人指定同一个长度。一起结束，才使得一个确认能收掉整组，而填充买的正是这一点。' },
    },
  ],
}
