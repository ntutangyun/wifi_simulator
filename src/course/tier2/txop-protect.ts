/**
 * Wi-Fi Tier 2 · M3 · QoS and efficiency · Protecting a whole burst.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the hallway
 * house of `hidden`, but the winner now sends several frames in a row, so the
 * station that cannot hear it has a long window to blunder into instead of a
 * short one. One question and one answer at the start of the burst announce all
 * of it; CF-End hands back what the burst did not use; a CTS-to-self buys the
 * announcement without the question and is useless here. The costs and the
 * counts of the three policies are in `numbers`; the RTS-threshold corner and
 * what a CTS-to-self cannot do are in `deeper`; the clause numbers are in
 * `sources`.
 *
 * The scenario builder and its two variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/txop-protect.test.ts,
 * except the four counts of the 300 ms table and the observe list's timings,
 * which tests/course/lesson-claims.test.ts ("lesson 10 · protecting the burst")
 * has always held and still holds.
 */
import { type Lesson, N, hallwayHouse, node, sc, firstRts, firstCfEnd, firstCfEndRelay, firstCollision, J } from '../lessonKit'

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 2,
  title: { en: 'Protecting the burst — one answer for the whole burst', zh: '保护突发——一个回答管住整个突发' },
  why: {
    en: 'A station (STA) that wins the air can keep it for a while and send several frames back to back. That is a good bargain when everyone can hear everyone. Where one station cannot hear the other it is a trap: a long burst is a long stretch of time for the deaf neighbour to blunder into. The cure from the hidden-node lesson still works, but it has to be aimed further — announce the whole burst at once, in a voice the far room can hear.',
    zh: '抢到空口的站点（STA）可以多占一会儿，把好几帧连着发出去，而不是只发一帧。当屋里所有人都听得见所有人时，这是笔划算的买卖。可在一台站点听不见另一台的房子里，它就成了陷阱：一长串帧，无非就是给那位“聋着的”邻居留出了一大段可以撞进来的时间。隐藏节点那一课的解法依然管用，只是要瞄得更远——用远处那个房间听得见的声音，把整串帧一次性预告出去。',
  },
  outcomes: [
    { en: 'say why a burst is more dangerous than one frame when a station is hidden', zh: '说出有站点被隐藏时，为什么一串帧比单独一帧更危险' },
    { en: 'name the frame that carries a whole burst’s reservation into the far room', zh: '说出是哪一帧把整串帧的预约送进了远处那个房间' },
    { en: 'read a reservation off the timeline and watch it end early', zh: '在时间轴上读出一条预约，并看着它提前结束' },
    { en: 'compare the collisions and the airtime of the three policies', zh: '对比三种预告策略各自的碰撞次数与空口开销' },
  ],
  needs: ['nav', 'hidden', 'txop'],
  terms: [
    { term: 'protection', plain: {
      en: 'saying in advance how long you will hold the air, so stations that cannot hear you stay quiet anyway',
      zh: '事先说清自己要占用空口多久，好让那些听不见你的站点照样保持安静',
    } },
    { term: 'CF-End', plain: {
      en: 'a few bytes meaning “I have finished early”: everyone who hears it drops the reservation on the spot',
      zh: '几个字节的一帧，意思是“我提前结束了”：听见的人当场把这段预约作废',
    } },
    { term: 'CTS-to-self', plain: {
      en: 'a station sending the permission frame to its own address, taking the announcement without asking anyone',
      zh: '站点把“允许发送”那一帧发给自己的地址：不问任何人，直接把预告做了',
    } },
  ],
  picture: [
    { heading: { en: 'The same house, now in bursts', zh: '同一间房子，现在成串地发' }, text: {
      en: 'This is the hallway house of the hidden-node lesson: a station in each end room, the access point (AP) in the hallway between them, neither station able to hear a whisper of the other. What is new is that the winner no longer sends one frame and stops. It holds the air and sends several frames back to back. For the far room, which hears none of it, the danger is no longer a moment. It is a long stretch of time.',
      zh: '这还是隐藏节点那一课的走廊房子：两头的房间里各一台站点，接入点（AP）在中间的走廊里，两台站点谁也听不见对方一丁点动静。新的地方在于，赢家不再发一帧就收手：它占住空口，把好几帧连着发出去。而对那个什么也听不见的远房间来说，危险不再是一瞬间，而是一大段时间。',
    } },
    { heading: { en: 'Announce the burst, not the next frame', zh: '预告的是整串，而不是下一帧' }, text: {
      en: 'Before the burst the holder still sends its short question, and the access point still answers out loud, so both rooms hear it. What matters now is how much that answer announces: only the frame about to go out, or every frame of the burst. Announcing the whole burst in one breath is this lesson’s protection — the difference between a far station that sits the burst out and one that wakes in the middle.',
      zh: '发这一串之前，持有者照样先发出那句简短的提问，接入点也照样大声回答，于是两个房间都听得见这个回答。现在关键在于：这个回答预告了多少——只是马上要发的那一帧，还是这一串里的每一帧。一口气把整串预告出去，就是这一课说的保护；一个远端站点是安安静静把整串等完，还是在半途中醒来，差别就在这里。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Watch the far room fall quiet', zh: '看远处那个房间安静下来' }, text: {
      en: 'Load the simulation and jump to the first question. Watch the far station’s lane: a reservation appears under it and runs to the end of a burst it cannot hear a single frame of. Then load the single-protection variant and watch that lane wake up while the burst is still going.',
      zh: '载入仿真，跳到第一次提问。盯住远端站点的泳道：它下方出现一条预约，一直延伸到那串帧的末尾——而这一串它连一帧都听不见。然后载入“单次保护”变体，再看同一条泳道：这一串还没发完，它就醒了。',
    } },
    { heading: { en: 'Giving the time back', zh: '把时间还回去' }, text: {
      en: 'An announcement covering the whole burst is usually longer than the burst needs: the queue runs dry, or the next frame no longer fits. So the holder gives the rest back with a few bytes meaning “I have finished early” — the CF-End. Everyone who hears it drops the reservation there and then. The far room cannot hear the holder — so the access point repeats the CF-End on its behalf: the same trick as the answer, pointing the other way.',
      zh: '覆盖整串的预告，通常比这串帧最后真正需要的更长：队列空了，或者下一帧已经塞不下。于是持有者用几个字节把剩下的还回去，意思是“我提前结束了”——这就是 CF-End。听见的人当场把预约作废。可远处那个房间听不见持有者——于是接入点替它把这个 CF-End 重复一遍。这和那个回答是同一个手法，只是方向反了过来。',
    } },
    { kind: 'list', heading: { en: 'Three ways to say it', zh: '预告的三种说法' }, items: [
      { en: 'Single: say nothing beyond the frame in hand. A far station is told of one exchange at a time, and counts on into the rest of the burst.', zh: '单次：除了手上这一帧，什么也不多说。远端站点一次只被告知一次交互，然后就径直数进了这一串剩下的部分。' },
      { en: 'Boundary: one question and one answer at the start, announcing the burst to its end. This is what the lesson loads.', zh: '边界：开头一问一答，把这一串预告到末尾为止。本课载入的就是这种。' },
      { en: 'Multiple: the same opening, and every data frame carries the time still to come, so a station that missed the answer can pick the reservation up from the data.', zh: '多重：开头同样是一问一答，而且每个数据帧都携带剩余时间，于是错过那个回答的站点，也能从数据帧里把预约接上。' },
    ] },
    { heading: { en: 'When nobody is there to answer', zh: '没人替你回答的时候' }, text: {
      en: 'Sometimes a holder wants the announcement without the asking. It can send the permission frame to its own address — a CTS-to-self, one frame where there were two. It costs half as much — and carries exactly as far as the holder’s own voice, which is to say, not into the far room.',
      zh: '有时候持有者只想要预告，不想要那次问答。它可以把“允许发送”那一帧直接发给自己的地址：这就是 CTS-to-self，本来两帧，现在一帧。代价少了一半——而它传得多远，和持有者自己的嗓门一模一样，也就是说，传不进远处那个房间。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The same three hundred milliseconds, three ways', zh: '同样的三百毫秒，三种说法' }, head: [
      { en: 'Counted over 300 ms', zh: '300 ms 内的统计' }, { en: 'single', zh: '单次' }, { en: 'boundary', zh: '边界' }, { en: 'multiple', zh: '多重' },
    ], rows: [
      [{ en: 'Collisions', zh: '碰撞次数' }, N('46'), N('21'), N('21')],
      [{ en: 'Data frames delivered', zh: '成功送达的数据帧' }, N('212'), N('614'), N('614')],
      [{ en: 'Retries', zh: '重传' }, N('112'), N('47'), N('47')],
      [{ en: 'Frames dropped', zh: '丢弃帧数' }, N('6'), N('1'), N('1')],
    ] },
    { kind: 'table', heading: { en: 'What the announcing frames cost, and what they buy', zh: '用来预告的那些帧，花了多少，换回什么' }, head: [
      { en: 'Per 300 ms', zh: '每 300 ms' }, { en: 'single', zh: '单次' }, { en: 'boundary', zh: '边界' }, { en: 'multiple', zh: '多重' },
    ], rows: [
      [{ en: 'Air spent on questions, answers and CF-End', zh: '花在提问、回答与 CF-End 上的空口时间' }, N('14.9 ms'), N('14.3 ms'), N('14.3 ms')],
      [{ en: 'Air spent per frame delivered', zh: '每送达一帧所花的空口时间' }, N('1281 µs'), N('422 µs'), N('422 µs')],
      [{ en: 'Average reservation a hidden station loads', zh: '隐藏站点装上的预约，平均有多长' }, N('1.05 ms'), N('2.45 ms'), N('2.45 ms')],
    ] },
    { heading: { en: 'The same bill, better aimed', zh: '同样的账单，瞄得更准' }, text: {
      en: 'Protection is not the expensive part: either way about a twentieth of the air goes on the announcing frames, slightly less under boundary, because one opening serves a whole burst. What changes is the reach: the reservation a hidden station loads lasts 2.45 ms instead of 1.05 ms, so it sits the burst out, and the room delivers nearly three times the frames for a third of the air each.',
      zh: '保护本身并不是花钱的地方：两种策略花在预告帧上的空口时间都在二十分之一上下，边界还略少一点，因为一次开场就管住了一整串。变的是覆盖范围：隐藏站点装上的预约平均是 2.45 ms，而不是 1.05 ms，于是它把整串等完；整个房间送达的帧数接近三倍，而每送达一帧所花的空口时间只有原来的三分之一。',
    } },
    { heading: { en: 'What the third policy adds, and what it does not', zh: '第三种策略多给了什么，又没给什么' }, text: {
      en: 'Multiple protection puts the whole remainder on every data frame, up to 2.164 ms. Nobody in this house needs it — every station that could collide has already heard the answer — so its run comes out identical to boundary, collision for collision.',
      zh: '多重保护把整个剩余时间写进每一个数据帧，最长可达 2.164 ms。这间房子里没人需要它——所有可能撞车的站点都已经听见了那个回答——所以它跑出来和边界保护完全一样，一次碰撞对一次碰撞。',
    } },
    { heading: { en: 'The collisions that are left', zh: '剩下的那些碰撞' }, text: {
      en: 'Of the 21 collisions that survive, 18 are one question meeting another: two hidden stations starting within one question of each other, losing 20 bytes each instead of a burst. Only 3 catch a data frame under way — the hidden-node bargain, stretched to a whole burst.',
      zh: '活下来的 21 次碰撞里，有 18 次是两句提问撞在一起：两台隐藏站点的起跑时刻，相差不到一句提问那么长，于是各损失 20 字节，而不是一整串帧。只有 3 次撞上了正在进行中的数据帧。这正是隐藏节点那一课里的那笔交易，从一帧扩展到了一整串。',
    } },
    { kind: 'steps', heading: { en: 'How one question covers a whole burst', zh: '一句提问怎么管住整串' }, items: [
      { en: 'Before its first frame the holder plans the turn: it adds up the exchanges now queued for this class that would still end inside the limit, 2 528 µs here. If more than one fits, there is a burst worth announcing.',
        zh: '发第一帧之前，持有者先把本轮规划一遍：把这一类队列里排着的帧走一遍，把那些仍能在上限之内结束的交互加起来——这里的上限是 2 528 µs。能装下不止一次交互，就真有一串值得预告。' },
      { en: 'It opens with the short question, an RTS of 20 bytes sent at a rate the whole room can decode. Its Duration field is the whole turn less the question’s own 28 µs: 2 500 µs.',
        zh: '它先发出那句简短的提问：一帧 20 字节的 RTS，用全屋都解得开的速率发出。它的 Duration 字段写的是整轮减去提问自身的 28 µs：2 500 µs。' },
      { en: 'Every radio that decodes the question loads it as a reservation. One pause later the access point answers with a CTS carrying what is left after that pause and the answer itself, 2 456 µs — the only frame the far room can hear.',
        zh: '每一台解出这句提问的电台，都把这个值装成一条预约。隔一段停顿，接入点回一帧 CTS，里面写的是扣掉这段停顿和回答自身之后剩下的 2 456 µs——而这个回答，是本轮里远房间唯一听得见的一帧。' },
      { en: 'The burst then runs exchange after exchange, one pause apart. Each data frame’s own Duration covers no more than its own answer — 44 µs on this one, 60 µs at most in this run — because the reservation the far room is holding already reaches the end.',
        zh: '接下来这一串就一次接一次地交互，中间只隔一段停顿。每个数据帧自己的 Duration 只管到它自己的回答为止——这一帧是 44 µs，本轮最多也就 60 µs——因为远房间手上那条预约已经盖到了末尾。' },
      { en: 'When the queue runs dry or the next exchange no longer fits, the holder gives the rest back: if more than a pause, a CF-End and a slot are left, it sends CF-End, the access point repeats it one pause later, and either copy drops the reservation.',
        zh: '等到队列空了，或者下一次交互再也装不下了，持有者就把剩下的还回去：只要剩下的比“一段停顿 + 一个 CF-End + 一个时隙”还长，它就发出 CF-End，接入点隔一段停顿再重复一遍；两份里听见任一份的人，当场把预约作废。' },
    ] },
    { kind: 'table', heading: { en: 'The burst that starts at 0.736 ms, step by step', zh: '从 0.736 ms 开始的那一串，一步一步' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'the question goes out, Duration 2 500 µs', zh: '提问发出，Duration 2 500 µs' }, N('0.736 ms')],
      [{ en: 'the answer is in, Duration 2 456 µs', zh: '回答到手，Duration 2 456 µs' }, N('0.808 ms')],
      [{ en: 'so the far station’s reservation runs to', zh: '于是远端站点的预约一直管到' }, N('3.264 ms')],
      [{ en: 'five exchanges of 416 µs; the last answer lands at', zh: '五次交互，每次 416 µs；最后一个回答落在' }, N('2.888 ms')],
      [{ en: 'left on the announced reservation', zh: '已预告的预约还剩' }, N('376 µs')],
      [{ en: 'one more exchange would need', zh: '再做一次交互需要' }, N('416 µs ✗')],
      [{ en: 'CF-End at 2.904 ms, repeated, so the reservation ends at', zh: 'CF-End 发于 2.904 ms，又被重复一遍，预约结束于' }, N('2.976 ms')],
    ] },
  ],
  deeper: [
    { heading: { en: 'The turns that get no announcement at all', zh: '完全得不到预告的那些轮次' }, text: {
      en: 'A holder only sends the opening question when it actually plans more than one exchange — with nothing to burst, there is nothing to protect. So a turn that will hold a single frame is covered only if that frame is above the station’s RTS threshold, which is why this scene sets the threshold at 500 bytes. Raise it to 3000, above every frame here, and those turns go out bare: collisions rise from 21 to 80, deliveries fall from 614 to 344. The frames left bare are the slow ones — one of them is 1.9 ms of air, and gives a hidden station the longest run at it.',
      zh: '只有当这一轮确实计划了不止一次交互时，持有者才会发出开场那句提问——没有一串要发，也就没有什么要保护。于是只装得下一帧的那种轮次，只有当这一帧超过本站的 RTS 门限时才受保护，这正是本场景把门限设成 500 字节的原因。把它调到 3000、高过这里的每一帧，那些轮次就裸奔上阵：碰撞从 21 次升到 80 次，送达从 614 帧降到 344 帧。裸奔的恰恰是慢帧——其中一帧占了 1.9 ms 的空口，也就给了隐藏站点最长的一段可乘之机。',
    } },
    { heading: { en: 'What a CTS-to-self cannot do', zh: 'CTS-to-self 做不到的事' }, text: {
      en: 'Sending the permission frame to yourself saves the question, and in a crowded room of mixed-age radios that is a real saving. In this house it protects nothing at all: the frame travels exactly as far as everything else the holder sends, so the station in the far room never hears it and its counter runs on regardless. A cheaper announcement is worth nothing if it is inaudible where the danger is.',
      zh: '把“允许发送”发给自己，省掉的是那次提问；在一屋子新旧混杂的设备里，这笔节省是实打实的。但在这间房子里，它什么也保护不了：这一帧传得和持有者发的其它东西一样远，远房间里的站点根本听不见，它的计数器照样往下走。预告再便宜，如果在危险所在之处听不见，就一文不值。',
    } },
  ],
  sources: [
    { en: 'How a QoS station sets the Duration field under single and multiple protection is §9.2.5 (in particular §9.2.5.2) of IEEE Std 802.11-2024; the RTS/CTS exchange itself is §10.3.2.9.',
      zh: 'QoS 站点在单次与多重保护下如何填写 Duration 字段，见 IEEE Std 802.11-2024 的 §9.2.5（尤其是 §9.2.5.2）；RTS/CTS 交互本身见 §10.3.2.9。' },
    { en: 'CF-End and the rule that a station receiving one resets its NAV are §10.23.2.10, "Truncation of TXOP". The standard spells the access point’s repeat out for an S1G access point; this simulator grants it to every access point, which is a model choice.',
      zh: 'CF-End，以及“收到它的站点清零 NAV”这条规则，见 §10.23.2.10《TXOP 的截断》。标准是针对 S1G 接入点写明那次重复的；本仿真器让所有接入点都这么做，这是模型取值。' },
    { en: 'CTS-to-self is one of the NAV distribution mechanisms of §10.3.2.15, which says in as many words that it costs less than RTS/CTS and is less robust against hidden nodes.',
      zh: 'CTS-to-self 是 §10.3.2.15 所列的 NAV 分发机制之一；标准正文明说它比 RTS/CTS 开销更低，但对隐藏节点更不稳健。' },
    { en: 'Every count, average and timestamp above is the model’s own, reproducible from this scene’s seed rather than taken from the standard.',
      zh: '上面每一个计数、平均值与时刻都是模型取值，靠本场景的随机种子即可复现，并非取自标准正文。' },
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
    { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
  ], { rtsThresholdBytes: 500 }),
  variants: [
    {
      label: { en: 'single protection (per exchange)', zh: '单次保护（逐次交换）' },
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
      ], { rtsThresholdBytes: 500 }),
    },
    {
      label: { en: 'multiple protection (data frames carry the remainder)', zh: '多重保护（数据帧携带剩余时间）' },
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
        { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('first RTS', '第一个 RTS', firstRts),
    J('first CF-End', '第一个 CF-End', firstCfEnd),
    J('first CF-End relayed by the AP', '第一个由接入点重复的 CF-End', firstCfEndRelay),
    J('first collision', '第一次碰撞', firstCollision),
  ],
  observe: [
    { en: '“first RTS”: both stations ask at t = 0 and collide. A’s third try at 0.736 ms gets through, reserving 2500 µs, and the AP’s answer at 0.780 ms carries 2456 µs — one SIFS and itself less. Hidden B’s lane turns purple until 3.264 ms, though B never hears A.', zh: '“第一个 RTS”：两台站点都在 t = 0 开口发问，撞在一起。A 在 0.736 ms 的第三次尝试成功了，预约 2500 µs；接入点在 0.780 ms 的回答携带 2456 µs——正好少了一个 SIFS 和它自身。隐藏站 B 的泳道一直紫到 3.264 ms，尽管 B 从来听不到 A。' },
    { en: '“first CF-End” (≈ 2.90 ms): after five exchanges, 376 µs of the reservation are left — too little for another frame and its answer. A sends CF-End, the AP repeats it one SIFS later, and B’s reservation ends at 2.976 ms instead of 3.264 ms.', zh: '“第一个 CF-End”（≈ 2.90 ms）：五次交互之后，预约还剩 376 µs——不够再发一帧加它的回答。A 发出 CF-End，接入点在一个 SIFS 之后重复一遍，于是 B 的预约在 2.976 ms 结束，而不是 3.264 ms。' },
    { en: '“first collision” lands at t = 28 µs, the end of the two questions that started together — not a ruined burst. Now load single protection: the far station wakes up inside the burst, and 24 of its 29 data-frame collisions are not the first exchange of a turn.', zh: '“第一次碰撞”落在 t = 28 µs，那是同时开口的两句提问结束的时刻，而不是报废了一整串。再载入“单次保护”：远端站点在这一串的中途醒来，它那 29 次数据帧碰撞里，有 24 次都不是某一轮的第一次交互。' },
  ],
  tryThis: [
    { en: 'Load the “multiple protection” variant and hover a data frame inside a burst: its Duration now reaches the end of the turn, 2.164 ms at the longest, where boundary protection carries 60 µs. The counters do not move — the same 21 collisions, the same 614 frames delivered.', zh: '载入“多重保护”变体，悬停这一串中间的某个数据帧：它的 Duration 现在直达本轮末尾，最长 2.164 ms，而边界保护下只有 60 µs。但计数一点没变——还是 21 次碰撞，还是送达 614 帧。' },
    { en: 'Open the scenario in the editor, turn bursting off on both stations and reload. Every frame contends for itself again, no station holds the air for two frames in a row, and there is no burst left to protect.', zh: '在编辑器中打开本场景，把两台站点的突发关掉再重新载入。每一帧又要各自去竞争，没有哪台站点能连着两帧占住空口，也就没有什么突发需要保护了。' },
  ],
  quiz: [
    {
      q: { en: 'Hidden B never hears A. Which frame keeps B quiet for A’s whole burst?', zh: '隐藏站 B 从来听不见 A。是哪一帧让 B 在 A 的整串帧期间保持安静？' },
      options: [
        { en: 'A’s question', zh: 'A 的提问' },
        { en: 'The access point’s answer', zh: '接入点的回答' },
        { en: 'A’s first data frame', zh: 'A 的第一个数据帧' },
      ],
      answer: 1,
      explain: { en: 'Only the access point is audible to B. Its answer repeats A’s reservation, and under boundary protection that reservation reaches the end of the burst.', zh: 'B 只听得见接入点。它的回答把 A 的预约重复了一遍，而在边界保护下，这段预约一直管到这一串的末尾。' },
    },
    {
      q: { en: 'A burst ends well before the reservation it announced. What happens?', zh: '一串帧比它预告的预约提前不少就结束了。会发生什么？' },
      options: [
        { en: 'Nothing — everyone waits the reservation out', zh: '什么也不发生——所有人把预约等完' },
        { en: 'The holder sends CF-End, and the access point repeats it', zh: '持有者发出 CF-End，接入点再重复一遍' },
        { en: 'The holder asks again', zh: '持有者再问一次' },
      ],
      answer: 1,
      explain: { en: 'CF-End hands the unused time back. Stations that hear either copy drop the reservation; anyone who hears neither waits until the announced end.', zh: 'CF-End 把没用掉的时间还回去。听见任意一份的站点作废预约；两份都没听见的，只能等到预告的末尾。' },
    },
  ],
}
