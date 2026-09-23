/**
 * Wi-Fi Tier 1 · M2 · Channel access · SIFS, DIFS and the ACK dance.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): priority
 * as lengths of silence, told in plain words first, with the three waits and
 * the run's own timestamps in `numbers`.
 *
 * Every number quoted below is pinned in tests/course/ifs.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash stays identical.
 */
import { type Lesson, N, oneRoom, node, sc, firstData, firstAck, firstBackoffDraw, J } from '../lessonKit'

export const ifs: Lesson = {
  id: 'ifs',
  module: 1,
  title: { en: 'SIFS, DIFS and the ACK dance', zh: 'SIFS、DIFS 与 ACK 之舞' },
  why: {
    en: 'A shared channel needs a rule for who speaks next, and Wi-Fi’s rule is almost embarrassingly simple: wait. What makes it work is that not everybody waits the same amount. A station (STA) finishing a conversation already under way waits the shortest time of all, so nothing can cut in on it; a station merely asking for a turn waits longer. Priority here is measured in silence.',
    zh: '共享信道需要一条“下一个谁说”的规则，而 Wi-Fi 的规则简单得近乎寒碜：等。让它真正管用的，是大家等的时间并不一样长。正在把一场对话收尾的站点（STA）等得最短，所以谁也插不进它；只是想要个发言机会的站点则要等得更久。这里的优先级，是用沉默的长短来量的。',
  },
  outcomes: [
    { en: 'name the three waiting times and say who may transmit after each', zh: '说出三种等待时长，并讲清每一种之后谁可以发送' },
    { en: 'find the short gap between a frame and its answer on the timeline and measure it', zh: '在时间轴上找到一帧与它的回答之间的短间隙，并把它量出来' },
    { en: 'explain why a new contender can never get in front of an acknowledgement', zh: '解释为什么新的竞争者永远抢不到确认帧前面去' },
  ],
  needs: ['airtime'],
  terms: [
    { term: 'slot', plain: {
      en: 'the unit the longer waits are counted in: long enough for a signal to cross the room and be noticed',
      zh: '数较长等待时用的单位：长到足够让一个信号穿过房间并被察觉' },
    },
    { term: 'SIFS', plain: {
      en: 'short interframe space: the brief pause inside one exchange, before the answer comes back',
      zh: '短帧间间隔：一次交互内部的短暂停顿，回答就在这之后过来',
    } },
    { term: 'DIFS', plain: {
      en: 'distributed interframe space: the longer quiet a station must hear before it may start something new',
      zh: '分布式帧间间隔：站点在开启一件新事之前，必须先听到的那段更长的安静',
    } },
    { term: 'EIFS', plain: {
      en: 'extended interframe space: the extra-long quiet owed by a station that heard a frame arrive broken',
      zh: '扩展帧间间隔：听到一帧坏掉了的站点，欠下的那段格外长的安静',
    } },
  ],
  picture: [
    { heading: { en: 'Why waiting is the whole rule', zh: '为什么“等”就是全部规则' }, text: {
      en: 'Nobody is in charge of the air. There is no clock all the stations share, and no list saying whose turn it is. All a station can do is listen, and the only thing it controls is how long it insists on hearing nothing before it starts. Make that required silence short for some stations and long for others, and you have priority — with no messages, no negotiation and no scheduler anywhere.',
      zh: '空口上没有谁说了算。没有一只大家共用的时钟，也没有一张“轮到谁”的名单。站点能做的只有听，而它唯一能自己决定的，是开口之前坚持要听到多久的“什么都没有”。让一部分站点要求的这段安静短一些、另一部分长一些，优先级就有了——不需要任何消息、任何协商，也不需要任何调度器。',
    } },
    { heading: { en: 'The short gap: finishing what was started', zh: '短间隙：把已经开始的事做完' }, text: {
      en: 'An exchange is not one frame. The data goes out, and a moment later the answer comes back. That moment is the SIFS, and it is the shortest wait in the protocol — just enough for the receiver’s radio to turn around from listening to sending. Because it is the shortest, a station already inside an exchange is always back on the air before anyone else is even allowed to consider starting.',
      zh: '一次交互不止一帧。数据发出去，过一小会儿回答就回来了。这一小会儿就是 SIFS，它是整个协议里最短的一段等待——刚好够接收端的射频从“在听”翻转成“在发”。正因为它最短，已经身处一次交互之中的站点，总能在别人连“要不要开口”都还没资格考虑之前就重新上口。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Step through the short gap', zh: '一步一步走过短间隙' }, text: {
      en: 'Load the simulation and jump to the first acknowledgement. Step backwards with the microsecond buttons: between the end of the data block and the start of the answer, nothing at all happens. Measure it.',
      zh: '载入仿真，跳到第一个确认帧。用微秒按钮往回一步一步走：从数据块结束到回答开始，中间什么也没发生。把它量出来。',
    } },
    { heading: { en: 'The longer gap: asking for a turn', zh: '长间隙：请求一个发言机会' }, text: {
      en: 'A station with something new to send is not continuing anything, so it must wait longer: a DIFS, which is the short gap plus two slots. Those two extra slots are the margin that keeps it out of the way. By the time a contender has heard enough silence to be allowed to start, an answer that was going to come has already come.',
      zh: '手里攥着新东西要发的站点，并不是在续接什么，所以它必须等得更久：一个 DIFS，也就是短间隙再加两个时隙。多出来的这两个时隙，就是让它不碍事的余量。等一个竞争者听够了安静、终于获准开口时，本该回来的那个回答早就回来了。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'And through the longer one', zh: '再走一遍长间隙' }, text: {
      en: 'Now jump to the first backoff draw. Look at the lane just before it: the quiet after the answer ends is the DIFS, and the station only starts counting once that quiet is over.',
      zh: '再跳到第一次退避抽取。看它前面那一小段泳道：回答结束之后的那段安静就是 DIFS，站点要等这段安静走完，才开始数数。',
    } },
    { heading: { en: 'The penalty gap: I heard something break', zh: '惩罚间隙：我听见有东西碎了' }, text: {
      en: 'There is a third wait, owed by a station that began receiving a frame and found it damaged. It cannot read who the frame was for, or how much longer the exchange needs, yet somebody may be about to answer it. So it stays quiet for an EIFS — the short gap, a whole acknowledgement’s worth of air, and a DIFS on top — and only then joins in. Nothing in this scene ever earns one.',
      zh: '还有第三种等待，欠在那些“已经开始接收、却发现帧坏了”的站点头上。它读不出这帧是发给谁的，也读不出这次交互还要多久，可偏偏可能有人马上就要回答它。于是它保持安静一个 EIFS——短间隙、加上发完一个确认帧所需的整段空口、再加上一个 DIFS——之后才参与进来。本场景里没有任何东西会挣到这样一段等待。',
    } },
    { kind: 'list', heading: { en: 'One ladder, three rungs', zh: '一把梯子，三级台阶' }, items: [
      { en: 'shortest — the answer inside an exchange that is already running', zh: '最短——已经在进行的交互里，那个回答' },
      { en: 'longer — anybody asking for a new turn', zh: '较长——任何想要一个新发言机会的人' },
      { en: 'longest — anybody who heard a frame arrive broken', zh: '最长——任何听到一帧坏着到达的人' },
    ] },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The three waits', zh: '三种等待' }, head: [
      { en: 'Gap', zh: '间隙' }, { en: 'Length', zh: '时长' }, { en: 'Who may transmit after it', zh: '之后谁可以发送' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [N('slot'), N('9 µs'), { en: 'the unit the longer waits are built from', zh: '较长等待都是拿它搭出来的' }, N('§17.4.4')],
      [N('SIFS'), N('16 µs'), { en: 'only the exchange already running — its answer can never be beaten to the channel', zh: '只有已经在进行的那次交互——它的回答永远不会被抢先' }, N('§17.4.4')],
      [N('DIFS'), { en: '34 µs = SIFS + 2 slots', zh: '34 µs = SIFS + 2 个时隙' }, { en: 'any station asking for a new turn', zh: '任何想要新发言机会的站点' }, N('§10.3.2.3.5')],
      [N('EIFS'), { en: '94 µs = 16 + 44 + 34: a SIFS, an ACK at the slowest rate, a DIFS', zh: '94 µs = 16 + 44 + 34：一个 SIFS、一个以最慢速率发出的 ACK、一个 DIFS' }, { en: 'a station whose reception started and then failed its check', zh: '已经开始接收、却校验失败的站点' }, N('§10.3.2.3.7')],
    ] },
    { kind: 'steps', heading: { en: 'How a station decides it may start', zh: '站点怎么判定自己可以开口' }, items: [
      { en: 'It only asks the question when it has something to send. The first test is the medium: busy means either its own sensing reports energy, or a reservation timer it is holding has not yet run out. Either one, and the attempt is deferred on the spot.',
        zh: '只有手里有东西要发时，它才问这个问题。第一道测试是介质：忙，指的是它自己的侦听报告有能量，或者它挂着的某个预约倒计时还没走完。只要占上一条，这次尝试当场被推迟。' },
      { en: 'If the medium is free, the station works out which gap it owes. Normally a DIFS. If the last reception it started ended in a failed check, it owes an EIFS instead, and it keeps owing it until it transmits something itself.',
        zh: '介质空着，站点就算出自己欠哪一段间隙。通常是 DIFS。要是它上一次开始的接收以校验失败告终，欠的就换成 EIFS；而且这段额外的安静一直欠着，直到它自己发出点什么为止。' },
      { en: 'Silence already elapsed counts. The gap ends at whichever comes later: now, or the instant the medium last went quiet plus that gap. A radio that has never yet heard the medium busy counts as idle since for ever, so its gap is zero long — which is why the first frame of this run leaves at 0 µs.',
        zh: '已经过去的那段安静是算数的。间隙结束于两者中较晚的那一个：此刻，或者“介质上一次安静下来的时刻加上这段间隙”。一台从来没听见介质忙过的电台，算作从一开始就空闲着，于是它这段间隙的长度是零——本轮第一帧在 0 µs 就发了出去，原因就在这里。' },
      { en: 'If the gap runs to its end without interruption, and nothing deferred this attempt along the way, the station transmits immediately and draws no random wait at all. That is basic access.',
        zh: '如果这段间隙一路走到头、中途没被打断，而且这次尝试一次也没被推迟过，站点就立刻发送，连随机等待都不抽。这叫基本接入。' },
      { en: 'If anything makes the medium busy while the gap is running, the gap is thrown away and the attempt is marked as deferred. When the medium next goes quiet the station waits the whole gap over again — and this time it must draw a random wait before it may send.',
        zh: '间隙还在走时，谁把介质弄忙了，这段间隙就作废，这次尝试被记上“推迟过”。等介质下一次安静下来，站点要把整段间隙重走一遍——而且这一次，开口之前必须先抽一个随机等待。' },
      { en: 'The answer inside an exchange skips every step above. A receiver that owes an ACK does not contend at all: it puts the answer on the air one SIFS after the frame ends, whatever anybody else is counting.',
        zh: '交互内部的那个回答，上面每一步都不走。欠着一个 ACK 的接收端根本不参与竞争：它在帧结束后一个 SIFS 就把回答送上空口，别人数到哪儿都不管。' },
    ] },
    { heading: { en: 'What that buys in this run', zh: '这在本轮仿真里换来了什么' }, text: {
      en: 'The uploader’s frame holds the channel for 248 µs, and its answer starts exactly 16 µs after the frame ends — every one of the 254 answers in this run, never a microsecond more or less.',
      zh: '上传站点的帧把信道占住 248 µs，而它的回答恰好在帧结束后 16 µs 开始——本轮仿真里 254 个回答个个如此，一微秒也不多、一微秒也不少。',
    } },
    { kind: 'table', heading: { en: 'One full turn, in order', zh: '完整的一轮，按顺序' }, head: [
      { en: 'When', zh: '时刻' }, { en: 'What happens', zh: '发生了什么' },
    ], rows: [
      [N('0 µs'), { en: 'the uploader’s data frame starts', zh: '上传站点的数据帧开始' }],
      [N('248 µs'), { en: 'the frame ends and the channel goes quiet', zh: '帧结束，信道安静下来' }],
      [N('264 µs'), { en: 'the answer starts, one SIFS later', zh: '一个 SIFS 之后，回答开始' }],
      [N('292 µs'), { en: 'the answer ends; the DIFS begins', zh: '回答结束，DIFS 开始' }],
      [N('326 µs'), { en: 'the DIFS is over, and only now does the station draw its wait', zh: 'DIFS 走完，站点到这一刻才抽取自己的等待' }],
      [N('425 µs'), { en: 'the next frame starts', zh: '下一帧开始' }],
    ] },
    { heading: { en: 'The one you will not see here', zh: '这里你看不到的那一种' }, text: {
      en: 'No station in this scene ever waits an EIFS: every frame is either heard cleanly or not heard at all, so no reception ever starts and then fails. The 94 µs is real, and a later lesson puts one on screen.',
      zh: '本场景里没有任何站点等过 EIFS：每一帧要么被干干净净地听到，要么根本没被听到，从来不会出现“接收已经开始、随后失败”的情形。94 µs 是真的，后面有一课会把它摆到屏幕上。',
    } },
  ],
  sources: [
    { en: '§17.4.4 of IEEE Std 802.11-2024 gives aSIFSTime 16 µs and aSlotTime 9 µs for the 20 MHz OFDM PHY; §10.3.2.3.5 defines DIFS as SIFS plus two slot times.',
      zh: 'IEEE Std 802.11-2024 的 §17.4.4 给出 20 MHz OFDM PHY 的 aSIFSTime 为 16 µs、aSlotTime 为 9 µs；§10.3.2.3.5 把 DIFS 定义为 SIFS 加两个时隙。' },
    { en: '§10.3.2.3.7 defines EIFS as SIFS + DIFS + the time to send an acknowledgement at the lowest mandatory rate, which is 44 µs at 6 Mb/s in this model — hence 94 µs.',
      zh: '§10.3.2.3.7 把 EIFS 定义为 SIFS + DIFS + 以最低强制速率发完一个确认帧的时间；在本模型中后者是 6 Mb/s 下的 44 µs，因此总共 94 µs。' },
    { en: 'The 1528-byte frame, the saturated uploader and the timestamps above are this simulator’s scene, reproducible from its seed; they are not figures from the standard.',
      zh: '1528 字节的帧、处于饱和状态的上传站点，以及上面那些时刻，都是本仿真器的场景，靠随机种子可以复现；它们不是标准正文里的数字。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
    J('first backoff draw', '第一次退避抽取', firstBackoffDraw),
  ],
  observe: [
    { en: 'Pause on any exchange and step through the gap between the data block and the answer with the microsecond buttons: 16 µs of nothing, every single time.', zh: '在任意一次交互处暂停，用微秒按钮走过数据块与回答之间的间隙：每一次都是 16 µs 的“什么也没有”。' },
    { en: 'The gap after an answer is longer: a 34 µs DIFS runs before the station even draws its next wait. Watch the label above the node change.', zh: '回答之后的间隙更长：站点连下一次等待都还没抽取，先要走完一个 34 µs 的 DIFS。看节点上方的标签怎么变。' },
    { en: 'The first exchange ends at 292 µs, the DIFS runs to 326 µs, and the next frame does not start until 425 µs — the station drew eleven slots.', zh: '第一次交互在 292 µs 结束，DIFS 走到 326 µs，而下一帧要到 425 µs 才开始——这一次站点抽到了十一个时隙。' },
  ],
  tryThis: [
    { en: 'Zoom the timeline to about 200 µs and measure the DIFS against the 9 µs slot grid. It is one short gap plus exactly two slots, never more.', zh: '把时间轴缩放到大约 200 µs 的跨度，拿 9 µs 的时隙刻度去量 DIFS。它是一个短间隙加上恰好两个时隙，绝不会更多。' },
    { en: 'Follow one cycle in the event log: the frame, the answer, the DIFS, the draw, the next frame. Check that every DIFS in the run lasts 34 µs.', zh: '在事件日志里跟完一个周期：帧、回答、DIFS、抽取、下一帧。核对一下：本轮里每一个 DIFS 都是 34 µs。' },
  ],
  quiz: [
    {
      q: { en: 'Why is SIFS shorter than DIFS?', zh: '为什么 SIFS 比 DIFS 短？' },
      options: [
        { en: 'To give answers absolute priority: nobody waiting a DIFS can cut into an exchange already running', zh: '为了给回答绝对优先权：等着 DIFS 的人不可能插进一次已经在进行的交互' },
        { en: 'Because an acknowledgement is a physically shorter frame', zh: '因为确认帧本身是更短的帧' },
        { en: 'It is a historical accident with no purpose', zh: '这只是没什么道理的历史遗留' },
      ],
      answer: 0,
      explain: { en: 'The ladder of gaps is the priority mechanism. Because the short gap is shorter, the exchange always finishes before anyone else may begin.', zh: '这把间隙的梯子本身就是优先级机制。正因为短间隙更短，交互总能在别人获准开口之前先完成。' },
    },
    {
      q: { en: 'A station starts receiving a frame and its check fails. Before contending it must wait…', zh: '一个站点开始接收一帧，结果校验失败。再去竞争之前，它必须等……' },
      options: [
        { en: 'a DIFS, as usual', zh: '照常一个 DIFS' },
        { en: 'an EIFS — the frame it could not read may be about to be answered, and it must not trample that answer', zh: '一个 EIFS——那帧它没读出来的东西可能马上就要被回答，而它不能踩到那个回答' },
        { en: 'a SIFS, because it is now part of the exchange', zh: '一个 SIFS，因为它现在算是交互的一部分了' },
      ],
      answer: 1,
      explain: { en: 'A failed reception hides who the frame was for and how much longer the exchange needs, so the listener cannot know what is coming. The extra quiet covers a whole answer plus a DIFS.', zh: '接收失败意味着“这帧发给谁、这次交互还要多久”都没读到，侦听者无从知道接下来会发生什么。多出来的这段安静，刚好盖住一整个回答再加一个 DIFS。' },
    },
  ],
}
