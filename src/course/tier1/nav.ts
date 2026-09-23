/**
 * Wi-Fi Tier 1 · M2 · Channel access · NAV — reserving with a promise.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): what
 * listening cannot tell you, the announcement every header carries, and only
 * then the long frozen wait taken apart µs by µs. The "what A knows, and when"
 * material moved to `deeper`.
 *
 * Every number quoted below is pinned in tests/course/nav.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash stays identical.
 */
import { type Lesson, N, oneRoom, node, sc, firstNav, J } from '../lessonKit'

export const nav: Lesson = {
  id: 'nav',
  module: 1,
  title: { en: 'NAV — reserving with a promise', zh: 'NAV——用“预告”预约信道' },
  why: {
    en: 'Listening tells a station (STA) only whether the air is busy right now. But a conversation has gaps in it — the small pause before the answer comes back — and the answer itself may come from a device too far away to be heard. A station that trusts its ears alone will walk into both. So every frame announces how much longer its exchange will take, and everyone who hears it holds a timer instead.',
    zh: '光靠听，站点（STA）只知道空口此刻忙不忙。可一场对话里是有缝的——回答回来之前那一小段停顿；而回答本身，还可能来自一台远得根本听不见的设备。只相信自己耳朵的站点，这两处都会一头撞进去。于是每一帧都会预告本次交互还要多久，听到的人则改为在心里挂一个倒计时。',
  },
  outcomes: [
    { en: 'say what a station loads into its timer, and from which frames', zh: '说清站点往自己的计时器里装的是什么、从哪些帧里装' },
    { en: 'explain why listening to the channel is not enough to protect an exchange', zh: '解释为什么光听信道保护不了一次交互' },
    { en: 'read the reservation off a data frame and check it against the answer it protects', zh: '从数据帧上读出那份预约，并拿它保护的那个回答来核对' },
  ],
  needs: ['backoff'],
  terms: [
    { term: 'Duration', plain: {
      en: 'the field near the front of a frame saying how much longer, after this frame, the exchange still needs',
      zh: '帧头靠前的一个字段，说明这一帧之后，本次交互还需要多久',
    } },
    { term: 'NAV', plain: {
      en: 'network allocation vector: the countdown a station keeps, during which it treats the channel as busy even in silence',
      zh: '网络分配向量：站点自己挂着的一个倒计时，只要它还在走，哪怕一片寂静也当信道是忙的',
    } },
    { term: 'virtual carrier sense', plain: {
      en: 'treating the channel as busy because of something you were told, not something you can hear',
      zh: '把信道当作忙，依据的是别人告诉你的话，而不是你听得见的东西',
    } },
  ],
  picture: [
    { heading: { en: 'What your ears cannot tell you', zh: '耳朵告诉不了你的事' }, text: {
      en: 'Sensing the channel answers exactly one question: is there energy on the air at this instant? That is enough while a frame is being sent. It is not enough in the pause afterwards, when the air really is empty and yet the exchange is not finished. And it is not enough when the next frame will come from a device on the far side of the room that you cannot hear at all.',
      zh: '侦听信道只回答一个问题：此刻空口上有没有能量？帧还在发的时候，这就够了。可帧发完之后那段停顿里就不够了——那时空口确实是空的，交互却还没完。而当下一帧将由房间另一头、你压根听不见的设备发出时，它同样不够。',
    } },
    { heading: { en: 'A promise in every header', zh: '每个帧头里的一句承诺' }, text: {
      en: 'So each frame carries a small field near the front — the Duration — saying how much more time the exchange needs once this frame has ended. Anyone who decodes the frame takes that number and starts a countdown of its own (the NAV), including the stations the frame was never addressed to. While the countdown runs, the station behaves exactly as if the channel were busy, however quiet it sounds.',
      zh: '所以每一帧靠前的位置都带着一个小字段——Duration——说明这一帧结束之后，本次交互还需要多少时间。凡是解出这一帧的人，都会把这个数拿去起一个倒计时，也就是 NAV，包括那些根本不是收件人的站点。只要倒计时还在走，站点的行为就完全等同于“信道忙”，不管听上去有多安静。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Watch a timer being set', zh: '看一次计时器被装上' }, text: {
      en: 'Load the simulation and jump to the first reservation being set. It is the Listener, reacting to a data frame it had no part in: the frame ends, and at that exact instant its countdown starts.',
      zh: '载入仿真，跳到第一次预约被装上的地方。那是旁听者，它在对一帧与自己毫无关系的数据帧作出反应：帧一结束，它的倒计时就在那一刻起跑。',
    } },
    { heading: { en: 'Busy because you were told so', zh: '因为被告知，所以算忙' }, text: {
      en: 'This is virtual carrier sense, and it is the half of the rule that has nothing to do with radio. Real sensing protects the frame while the frame is on the air; the announcement protects everything that comes after it. One sentence is worth keeping: your ears guard the frame, the promise guards the gap and the answer.',
      zh: '这就是虚拟载波侦听，是这条规则里与射频毫无关系的那一半。真正的侦听保护的是还在空中的那一帧；而那句预告保护的，是它之后的一切。有一句话值得记住：耳朵守的是帧，承诺守的是间隙和回答。',
    } },
    { heading: { en: 'Only the remainder', zh: '只算剩下的部分' }, text: {
      en: 'Notice what the number leaves out: the frame carrying it. There is no need for it — while that frame is on the air, everybody’s ears already report busy. So a data frame’s announcement covers just the pause and the answer, and each later frame of the same exchange carries a smaller remainder than the one before it.',
      zh: '注意这个数没把什么算进去：它自己所在的那一帧。这本来也没必要——那一帧还在空中时，所有人的耳朵本来就报“忙”。所以数据帧预告的，只是那段停顿加上那个回答；而同一次交互里越靠后的帧，带的剩余量就越小。',
    } },
    { heading: { en: 'Frozen, and not knowing for how long', zh: '冻住了，却不知道要冻多久' }, text: {
      en: 'A station part-way through counting down its own wait simply stops when a frame starts, and at that moment it has no idea how long the interruption will last. It learns the frame’s length from the header; only when the frame has arrived whole and passed its check may it trust the announcement and set its countdown. Most of the wait is spent not knowing when the wait will end.',
      zh: '一个正数着自己那份等待的站点，在有帧开始时就地停住，而那一刻它根本不知道这次打断会持续多久。它从帧头里得知这一帧有多长；只有当整帧完整到达、校验通过之后，它才可以相信那句预告，并装上自己的倒计时。这段等待的大部分时间，它都不知道等待何时结束。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'Where the 44 µs comes from', zh: '44 µs 是怎么来的' }, head: [
      { en: 'Piece', zh: '组成' }, { en: 'Duration', zh: '时长' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [{ en: 'The pause before the answer', zh: '回答之前的停顿' }, N('16 µs'), N('§17.4.4')],
      [{ en: 'The answer itself: 14 bytes at the safe rate', zh: '回答本身：14 个字节，用保底速率发' }, N('28 µs'), N('§17.4.3')],
      [{ en: 'What the data frame announces', zh: '数据帧预告的量' }, N('44 µs'), N('§9.2.4.2')],
      [{ en: 'What the answer announces', zh: '回答预告的量' }, N('0 µs'), { en: 'the exchange is over', zh: '交互到此结束' }],
    ] },
    { heading: { en: 'The same number, every time', zh: '每一次都是同一个数' }, text: {
      en: 'All 576 data frames in this run announce the same 44 µs, and the Listener’s countdown ends at the exact nanosecond the answer ends — 513 times over, without once being early or late.',
      zh: '本轮仿真里 576 个数据帧预告的都是同一个 44 µs，而旁听者的倒计时，恰好在回答结束的那一纳秒到期——513 次无一例外，不早也不晚。',
    } },
    { kind: 'table', heading: { en: 'One long freeze, taken apart', zh: '把一段长长的冻结拆开' }, head: [
      { en: 'Ingredient', zh: '组成' }, N('µs'), { en: 'What Talker A is sitting through', zh: 'A 在熬的是什么' },
    ], rows: [
      [{ en: 'The rest of Talker B’s frame', zh: 'B 那一帧的剩余部分' }, N('248'), { en: 'the channel is audibly busy', zh: '信道听得出是忙的' }],
      [{ en: 'The reservation B announced', zh: 'B 预告的那份预约' }, N('44'), { en: 'silence, but spoken for', zh: '虽然安静，但已被预订' }],
      [{ en: 'One real DIFS', zh: '一个货真价实的 DIFS' }, N('34'), { en: 'genuinely idle', zh: '真正的空闲' }],
      [{ en: 'Total', zh: '合计' }, N('326'),
       { en: 'and then A resumes its backoff counter at 3 — the idle slots it still owed when the air went busy',
         zh: '之后 A 的退避计数从 3 继续——那是空口变忙时它还欠着的空闲时隙数' }],
    ] },
    { heading: { en: 'When A learns the total', zh: 'A 什么时候才算得出总数' }, text: {
      en: 'A freezes at 498 µs knowing only that the channel is busy. B’s frame ends at 746 µs and passes its check; only then can the reservation be trusted, running to 790 µs, with the last wait carrying A to 824 µs.',
      zh: 'A 在 498 µs 冻结，当时它只知道信道忙。B 的帧在 746 µs 结束并通过校验；直到这时那份预约才可信，它一直管到 790 µs，最后那段等待再把 A 送到 824 µs。',
    } },
    { kind: 'steps', heading: { en: 'From a field in a header to a frozen station', zh: '从帧头里的一个字段，到一台冻住的站点' }, items: [
      { en: 'Before it sends, the sender works out what is still to come after this frame has ended — one pause plus the answer’s airtime, 16 + 28 = 44 µs here — and writes that number into the Duration field of the header.',
        zh: '发送方在发出去之前先算清楚：这一帧结束之后还剩些什么——一段停顿加上回答的空口时间，这里是 16 + 28 = 44 µs——再把这个数写进帧头的 Duration 字段。' },
      { en: 'A frame that ends an exchange announces nothing to come. An acknowledgement carries 0 µs, and a Duration of zero sets nobody’s timer.',
        zh: '结束一次交互的那一帧，预告的是“后面没有了”。确认帧带的就是 0 µs；而写着零的 Duration，谁的计时器也装不上。' },
      { en: 'A station that receives the frame whole, passes its check, and finds the addressee is somebody else computes one instant: the moment this frame ended, plus the Duration it announced.',
        zh: '一台把这一帧完整收下、校验也通过、再发现收件人是别人的站点，会算出一个时刻：这一帧结束的那一刻，加上它预告的 Duration。' },
      { en: 'It adopts that instant only if it is later than the countdown it already holds. A frame can push a reservation further out; it can never pull one back in.',
        zh: '只有当这个时刻比它手里已经挂着的那个倒计时更晚时，它才采用。一帧可以把一份预约往后推，却永远不能把它往回拉。' },
      { en: 'Setting the countdown does what sensed energy does: a running backoff counter freezes at the value it stands on, and a gap in progress is thrown away, with the attempt marked as deferred.',
        zh: '装上这个倒计时之后发生的事，和侦听到能量时一模一样：正在走的退避计数在当前那个值上冻住，正在走的那段间隙作废，这次尝试被记上“推迟过”。' },
      { en: 'From then until the instant it set, the station’s test of the medium reads busy whatever its ears report. Busy means either that sensing is busy or that the countdown is still in the future — one of the two is enough.',
        zh: '从这一刻起，直到它装上的那个时刻为止，站点对介质的判定一律是“忙”，不管耳朵报的是什么。忙 = 侦听为忙，或者倒计时尚未到期——两者成立一个就够了。' },
      { en: 'At that instant the countdown clears. If sensing reports idle then, the station starts its gap and access resumes from the frozen value. A later lesson adds the two ways a reservation can be released before its instant arrives.',
        zh: '到了那个时刻，倒计时解除。如果这时侦听报的是空闲，站点就开始走它那段间隙，并从冻住的那个值恢复接入。预约还有两种提前解除的办法，留到后面的课。' },
    ] },
  ],
  deeper: [
    { heading: { en: 'A station never holds a schedule', zh: '站点手里从来没有时刻表' }, text: {
      en: 'The 326 µs total first becomes computable at 746 µs, by which point 248 µs — about three quarters of the wait — has already gone by. And even then the figure is conditional: another frame starting during the last 34 µs would simply extend it. A station carries no timetable, only a constantly revised belief, "the earliest I might resume is ___", re-derived at every event, with a single number carried through the fog: the frozen counter.',
      zh: '326 µs 这个总数，最早要到 746 µs 才算得出来，而那时等待本身已经过去了 248 µs，约四分之三。就算算出来了，这个数也是有条件的：最后那 34 µs 里若又有一帧开始，它只会继续变长。站点手里没有任何时刻表，只有一个不断修正的信念——“我最早可能在 ___ 恢复”——每来一个事件就重算一次；穿过这团迷雾时，它随身带着的只有一个数字：冻结住的那个计数。',
    } },
    { heading: { en: 'Why the label says one thing and the block means another', zh: '为什么标签写的是一回事，色块代表的是另一回事' }, text: {
      en: 'The lane draws that whole 326 µs as a single block and labels it with the final ingredient — the thing A is waiting for — rather than with the sum. It is not a 326 µs wait of that kind; it is everything A must sit through before its own countdown may resume, and the label names only the last of the three.',
      zh: '泳道把这整整 326 µs 画成一个色块，标签写的却是最后那一味组成——A 正在“等”的那个东西——而不是三段之和。它并不是一段 326 µs 的那种等待；它是 A 在自己的倒数获准恢复之前必须熬过的全部，而标签只点了三段里的最后一段。',
    } },
  ],
  sources: [
    { en: '§10.3.2.4 of IEEE Std 802.11-2024 gives the NAV update rule: a station that correctly receives a frame not addressed to it sets its NAV to the later of the current value and the frame’s end plus Duration.',
      zh: 'IEEE Std 802.11-2024 的 §10.3.2.4 给出 NAV 的更新规则：站点正确收到一帧不是发给自己的帧时，把 NAV 设为“当前值”与“帧结束时刻加 Duration”中较晚的那个。' },
    { en: 'The Duration field itself, and its meaning as a time in microseconds measured from the end of the current frame, are §9.2.4.2.',
      zh: 'Duration 字段本身，以及“它是从当前帧结束起算、以微秒为单位的一段时间”这一含义，见 §9.2.4.2。' },
    { en: 'The 248 µs frame, the 28 µs acknowledgement and every timestamp quoted above are this simulator’s scene, reproducible from its seed rather than taken from the standard.',
      zh: '248 µs 的帧、28 µs 的确认帧，以及上面引用的每一个时刻，都是本仿真器的场景，靠随机种子即可复现，并非取自标准正文。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Talker A', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'Talker B', 'sta', 6.5, 5, 'nonht', 'saturated'),
    node('sta-3', 'Listener', 'sta', 5, 6.5, 'nonht', 'browsing'),
  ]),
  jumps: [
    J('first NAV set', '第一次设置 NAV', firstNav),
  ],
  observe: [
    { en: 'The thin purple bars under a lane are the countdown. They end at the exact instant the answer ends — check any of the Listener’s 513 of them.', zh: '泳道下方那些细细的紫条就是倒计时。它们恰好在回答结束的那一瞬间到期——旁听者的 513 条里随便挑一条核对都一样。' },
    { en: 'Pause inside the gap between a frame and its answer. The air is silent, the Listener’s own sensing reports idle — and it still does not transmit.', zh: '在一帧与它的回答之间的间隙里暂停。空口一片安静，旁听者自己的侦听也报空闲——可它依然不发。' },
    { en: 'Hover a data block and read its Duration: 44 µs on every one of them, the pause plus the answer it is expecting.', zh: '悬停在一个数据块上，读它的 Duration：每一个都是 44 µs，也就是那段停顿加上它正等着的那个回答。' },
  ],
  tryThis: [
    { en: 'Pause inside a gap and open the Listener’s inspector: carrier sense idle, countdown running. Two different answers to “is the channel busy?” at the same instant.', zh: '在间隙里暂停，打开旁听者的检视器：载波侦听空闲，倒计时在走。同一瞬间，“信道忙不忙”有两个不同的答案。' },
    { en: 'Step Talker A from 498 µs to 824 µs with the microsecond buttons and name, at each moment, which of the three waits it is sitting in.', zh: '用微秒按钮把 A 从 498 µs 走到 824 µs，每走到一处就说出：它此刻熬的是三段等待里的哪一段。' },
  ],
  quiz: [
    {
      q: { en: 'What exactly does a station load into its countdown?', zh: '站点往自己的倒计时里装的到底是什么？' },
      options: [
        { en: 'The signal strength it measured', zh: '它测到的信号强度' },
        { en: 'The Duration of any frame it decoded correctly that was not addressed to it', zh: '任何它正确解出、而且不是发给自己的帧里的 Duration' },
        { en: 'A random hold-off time', zh: '一个随机的等待时间' },
      ],
      answer: 1,
      explain: { en: 'The frame has to arrive whole and pass its check first — an announcement that might be corrupted is worth nothing. Being the addressee is not required.', zh: '这一帧必须先完整到达、通过校验——一句可能已经损坏的预告毫无价值。至于是不是收件人，并不要求。' },
    },
    {
      q: { en: 'Why does a data frame’s announcement not cover the data frame itself?', zh: '数据帧的预告为什么不把这一帧自己算进去？' },
      options: [
        { en: 'Because the sender does not know its own frame’s length', zh: '因为发送方不知道自己这一帧有多长' },
        { en: 'Because while the frame is on the air, ordinary sensing already reports busy', zh: '因为这一帧还在空中时，普通的侦听本来就报“忙”' },
        { en: 'Because the field is too small to hold that number', zh: '因为那个字段太小，装不下这个数' },
      ],
      answer: 1,
      explain: { en: 'The announcement exists to cover what sensing cannot: the silent pause and an answer that may come from somewhere you cannot hear.', zh: '这句预告存在的意义，正是去盖住侦听盖不住的部分：那段安静的停顿，以及一个可能来自你听不见之处的回答。' },
    },
  ],
}
