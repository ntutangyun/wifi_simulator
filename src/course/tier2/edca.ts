/**
 * Wi-Fi Tier 2 · M3 · QoS and efficiency · EDCA, four queues in one radio.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): one radio
 * sorts its traffic into four queues, each queue contends on its own, and the
 * two knobs that decide who wins are the silence before counting and the width
 * of the draw. The dense material that used to open the lesson — the xIFS
 * ladder, the 2ⁿ − 1 series, the internal collision — lives in `deeper`, and
 * the clause numbers in `sources`.
 *
 * The scenario builder and the jump-zero predicate are unchanged, so the
 * recorded timeline hash stays identical. Every number quoted below is pinned
 * in tests/course/edca.test.ts.
 */
import { type Lesson, N, oneRoom, node, sc, firstVo, J } from '../lessonKit'

export const edca: Lesson = {
  id: 'edca',
  module: 2,
  title: { en: 'EDCA — four queues, four personalities', zh: 'EDCA——四条队列，四种性格' },
  why: {
    en: 'A phone call and a file upload want the same air, and they do not want it the same way. A few milliseconds of waiting ruins the call; nobody would notice the same wait on the upload. Yet the rules so far treat every frame alike, so the call takes its chances beside the upload and usually loses. This lesson watches a radio that stops being one contender and becomes four.',
    zh: '一通电话和一个文件上传抢的是同一片空口，但它们要的东西不一样。几毫秒的等待就能毁掉通话；同样的等待落在上传上，谁也察觉不到。可到目前为止的规则对每一帧都一视同仁，于是通话只能和上传一起碰运气，而且通常运气更差。这一课我们看一台电台如何不再以“一个竞争者”的身份参赛，而是变成四个。',
  },
  outcomes: [
    { en: 'say what changes inside a station once its traffic is sorted into four classes', zh: '说清一台站点把自己的流量分成四类之后，内部到底变了什么' },
    { en: 'read a class’s required silence and its draw width off the run, and say which one the head start came from', zh: '从仿真里读出某一类的必等静默和抽取宽度，并说出抢跑是哪一个带来的' },
    { en: 'explain what priority here cannot do, and what the lowest class pays for it', zh: '解释这里的优先级做不到什么，以及最低的那一类为此付出了什么' },
  ],
  needs: ['ifs', 'backoff', 'retries-queues'],
  terms: [
    { term: 'EDCA', plain: {
      en: 'enhanced distributed channel access: the rule that gives one station four waiting queues instead of one, each contending on its own',
      zh: '增强型分布式信道接入：这条规则让一台站点拥有四条等待队列，而不是一条，每一条各自去竞争',
    } },
    { term: 'access category', plain: {
      en: 'the class a frame is filed under on its way into the radio: voice, video, best effort or background',
      zh: '一帧进入电台时被归入的那一类：语音、视频、尽力而为、后台',
    } },
    { term: 'AIFS', plain: {
      en: 'arbitration interframe space: the silence a queue must hear before its countdown may move — the long fixed wait, made adjustable per class',
      zh: '仲裁帧间间隔：一条队列的倒数开始走动之前必须听到的那段安静——就是那段固定的长等待，只是按类别做成了可调的',
    } },
  ],
  picture: [
    { heading: { en: 'One radio, four waiting rooms', zh: '一台电台，四间候车室' }, text: {
      en: 'On its way into the radio, every frame is filed under one of four classes by what it carries: a call, a film, ordinary traffic, or something nobody is waiting for. Each class gets its own queue, and each queue runs its own countdown as if it were a separate station in the room. Whichever of them reaches zero first is what the radio sends. That is EDCA, and each of the four queues is an access category.',
      zh: '每一帧进入电台的时候，都会按它装的东西被归入四类之一：一通电话、一部影片、普通流量，或者压根没人在等的东西。每一类有自己的队列，每条队列各跑各的倒数，就像房间里另一台独立的站点一样。哪条先数到零，电台就发哪条的帧。这就是 EDCA，而这四条队列里的每一条，都是一个接入类别。',
    } },
    { heading: { en: 'Two knobs, and no referee', zh: '两个旋钮，没有裁判' }, text: {
      en: 'Nothing new was added to decide between them — no scheduler, no permission to ask. The four queues play the same waiting game the whole room plays, with two numbers set differently for each. The first is how long the queue must hear nothing before its counter may move at all: its AIFS. The second is how wide a range it draws its countdown from. Voice waits less and draws smaller. The lottery is simply rigged.',
      zh: '为了在它们之间分出胜负，并没有新增任何东西——没有调度器，也不用向谁请示。四条队列玩的还是整个房间都在玩的那套等待游戏，只是有两个数按类别分别设定。第一个是：这条队列必须先听到多久的“什么都没有”，它的倒数才被允许走动，这就是它的 AIFS。第二个是：它抽倒数值时的取值范围有多宽。语音等得更短，抽得更小。抽签，只不过是被做了手脚。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Watch the call get in', zh: '看通话是怎么挤进去的' }, text: {
      en: 'Load the simulation and jump to the caller’s first frame. The uploader beside it never stops; the call still gets on the air. Hover the caller’s countdown block, then the backup station’s, and compare the two numbers on them.',
      zh: '载入仿真，跳到通话站点的第一帧。旁边的上传站点从来没停过，可通话依然上了空口。把鼠标悬在通话站点的倒数色块上，再悬在备份站点的色块上，比一比这两个块上的数。',
    } },
    { heading: { en: 'A head start paid every round', zh: '每一轮都要兑现的抢跑' }, text: {
      en: 'The two knobs are not the same kind of advantage. A narrower draw only shifts the odds — the background queue may still roll low and win. The shorter silence is harder than that: while the background queue is still serving out its required quiet, the voice queue has already been counting down, and during those slots the background queue may not even begin. It is a head start, collected in every single round.',
      zh: '这两个旋钮给的优势并不是同一种。抽取范围更窄，只是把概率往一边拨了拨——后台队列照样可能抽到很小的数然后赢。更短的静默要硬得多：当后台队列还在熬它那段必等的安静时，语音队列已经在倒数了，而在这些时隙里，后台队列连开始的资格都没有。这是抢跑，而且每一轮都要兑现一次。',
    } },
    { heading: { en: 'What priority cannot do', zh: '优先级做不到的事' }, text: {
      en: 'None of this interrupts anything. A frame already on the air is on the air; a voice frame that arrives in the middle of somebody’s long burst waits for the whole burst to finish, exactly like every other frame. What priority buys is a better place in the argument over the next turn, never a way out of the current one. This is why voice here is quick on average and still has bad moments.',
      zh: '这一切都不会打断任何东西。已经在空中的帧就是在空中；一帧语音如果赶上别人正发着一长串突发，它就得等那串突发整个结束，和其他任何帧一样。优先级买到的，是在“下一轮归谁”这场争论里站得更靠前，而绝不是从这一轮里脱身的办法。所以这里的语音平均而言很快，却照样会有几次很难看的时刻。',
    } },
    { heading: { en: 'Somebody has to be last', zh: '总得有人排在最后' }, text: {
      en: 'The head start comes out of someone else’s pocket. The background class — a backup, an update, anything nobody is waiting for — takes the longest silence and the widest draw, so it reaches the air last and least often. In a busy room its frames sit in their queue many times longer than the call’s do. That is not a flaw in the design; it is the design, and it is why the class exists.',
      zh: '抢跑的额度是从别人兜里掏出来的。后台这一类——备份、更新，以及任何没人在等的东西——拿到的是最长的静默和最宽的抽取范围，于是它最晚、也最少地摸到空口。在一个繁忙的房间里，它的帧待在队列里的时间是通话的好几倍。这不是设计上的缺陷，这正是设计本身，也正是这一类存在的理由。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'What each class is given', zh: '每一类拿到的东西' }, head: [
      { en: 'Class', zh: '类别' }, { en: 'What it carries', zh: '它装什么' },
      { en: 'Silence first', zh: '先等的静默' }, { en: 'First draw from', zh: '第一次抽取范围' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [{ en: 'VO (voice)', zh: 'VO（语音）' }, { en: 'a call', zh: '一通电话' }, N('34 µs'), N('0–3'), N('Table 9-194')],
      [{ en: 'VI (video)', zh: 'VI（视频）' }, { en: 'a film', zh: '一部影片' }, N('34 µs'), N('0–7'), N('Table 9-194')],
      [{ en: 'BE (best effort)', zh: 'BE（尽力而为）' }, { en: 'ordinary traffic', zh: '普通流量' }, N('43 µs'), N('0–15'), N('Table 9-194')],
      [{ en: 'BK (background)', zh: 'BK（后台）' }, { en: 'a backup', zh: '一次备份' }, N('79 µs'), N('0–15'), N('Table 9-194')],
    ] },
    { kind: 'formula', heading: { en: 'Where those waits come from', zh: '这些等待是怎么来的' }, text: {
      en: 'silence = SIFS + n × slot = 16 + n × 9 µs,  n = 2, 3 or 7',
      zh: '静默 = SIFS + n × 时隙 = 16 + n × 9 µs，n 取 2、3 或 7',
    }, note: {
      en: 'The old one-size-fits-all wait was this same sum with n fixed at two. Nothing was invented; a constant was made into a parameter.',
      zh: '过去那段“一刀切”的等待，就是这同一个式子把 n 钉死在 2。什么都没有新发明，只是把一个常数改成了参数。',
    } },
    { kind: 'table', heading: { en: 'What the three stations actually did', zh: '三台站点实际的表现' }, head: [
      { en: 'Station', zh: '站点' }, { en: 'Class', zh: '类别' }, { en: 'Silence', zh: '静默' },
      { en: 'Draws', zh: '抽取次数' }, { en: 'Mean drawn', zh: '平均抽到' }, { en: 'Mean queue wait', zh: '平均排队时延' },
    ], rows: [
      [{ en: 'Caller', zh: '通话站点' }, N('VO'), N('34 µs'), N('33'), N('2.2'), N('1.49 ms')],
      [{ en: 'Uploader', zh: '上传站点' }, N('BE'), N('43 µs'), N('107'), N('7.9'), N('2.23 ms')],
      [{ en: 'Backup', zh: '备份站点' }, N('BK'), N('79 µs'), N('14'), N('8.2'), N('10.23 ms')],
    ] },
    { heading: { en: 'The head start, measured', zh: '把抢跑量出来' }, text: {
      en: 'The gap between the top row and the bottom one is 45 µs of silence — five slots in which the caller’s counter moves and the backup’s may not. Add the narrower draw, and the caller reaches zero from a mean of 2.2 slots against the backup’s 8.2.',
      zh: '最上面一行和最下面一行之间，相差 45 µs 的静默——也就是五个时隙，在这五个时隙里通话站点的计数在走，备份站点的不许走。再加上更窄的抽取范围：通话站点平均从 2.2 个时隙数到零，备份站点则是 8.2 个。',
    } },
    { heading: { en: 'The penalty is composed, not replaced', zh: '惩罚是叠加的，不是替换的' }, text: {
      en: 'Only the uploader ever hears a frame arrive broken here, and its punishment wait is 103 µs: the old penalty, minus the old fixed wait, plus its own class wait. The backup never collects one — a reception has to start before it can fail, and the collisions in this room bury both preambles at once.',
      zh: '这个房间里只有上传站点听到过坏掉的帧，它的惩罚等待是 103 µs：那段旧的惩罚，减去那段旧的固定等待，再加上它自己这一类的等待。备份站点一次都没摊上过——接收得先开始，才谈得上失败，而这个房间里的碰撞往往把两个前导一起淹没。',
    } },
    { heading: { en: 'The collision you will not see', zh: '你看不到的那种碰撞' }, text: {
      en: 'Two queues inside one radio can reach zero together as well, and then the higher class goes first. It never shows here: every station in this room runs a single class. `Deeper` has the rule.',
      zh: '一台电台内部的两条队列也可能同时归零，那时候由更高的那一类先发。这一幕在本场景里一次也没出现：这个房间里每台站点都只跑一类流量。规则写在“更深一步”里。',
    } },
  ],
  deeper: [
    { heading: { en: 'When two of your own queues tie', zh: '当自己的两条队列打平' }, text: {
      en: 'Four countdowns inside one radio can reach zero in the same slot, and only one frame can go out. The device resolves it in advance: the higher class transmits, and the lower one doubles its window and redraws exactly as if its frame had been lost in the air — an internal collision, paid without wasting a microsecond of airtime. Nothing of the sort happens in this room, because every station here runs a single class.',
      zh: '一台电台里的四个倒数，完全可能在同一个时隙同时归零，而能发出去的只有一帧。设备会提前把这件事解决掉：高的那一类发送，低的那一类把窗口翻倍、重新抽取，完全当作自己的帧在空中丢了一样——这叫内部碰撞，代价付了，却没浪费一微秒的空口时间。本场景里不会出现这种情况，因为这里每台站点都只跑一类流量。',
    } },
    { heading: { en: 'The whole ladder of waits', zh: '等待的整把梯子' }, text: {
      en: 'Every wait in the protocol is the same sum, SIFS plus n slots, and the family reads as one ladder: n = 0 is the pause inside an exchange, n = 1 is reserved for an access point’s own scheduled access, n = 2 is the old fixed contention wait, and n = 2, 3 or 7 are the four classes. The penalty wait after a broken reception is not a rung of that ladder but an overlay on it, which is why it composes with a class wait instead of replacing it.',
      zh: '协议里的每一种等待都是同一个和式：SIFS 加上 n 个时隙，整个家族可以读成一把梯子。n = 0 是一次交互内部的停顿，n = 1 留给接入点自己的调度接入，n = 2 是那段旧的固定竞争等待，而 n = 2、3、7 就是四个类别。收到坏帧之后的惩罚等待不是梯子上的一级，而是叠加在梯子上的一层，所以它与类别等待相加，而不是把它替换掉。',
    } },
    { heading: { en: 'Why the window doubles rather than grows', zh: '窗口为什么是翻倍而不是加一' }, text: {
      en: 'Each class has a smallest and a largest window, and the failures in between walk the series 2ⁿ − 1: 3, 7, 15, 31 and so on. Voice has only two rungs, 3 and 7, on purpose — a call that backs off for hundreds of slots is a call that has already failed — while background may climb all the way to 1023.',
      zh: '每一类都有一个最小窗口和一个最大窗口，中间每失败一次，就沿着 2ⁿ − 1 这个序列往上走：3、7、15、31……语音故意只有两级，3 和 7——一通退避到几百个时隙的电话，其实已经失败了——而后台可以一路爬到 1023。',
    } },
  ],
  sources: [
    { en: 'The four access categories and their default parameters are Table 9-194 of IEEE Std 802.11-2024 (the EDCA Parameter Set element, §9.4.2.28); AIFS[AC] = aSIFSTime + AIFSN × aSlotTime is §10.23.2.4, with 16 µs and 9 µs from §17.4.4.',
      zh: '四个接入类别及其默认参数见 IEEE Std 802.11-2024 的 Table 9-194（EDCA 参数集元素，§9.4.2.28）；AIFS[AC] = aSIFSTime + AIFSN × aSlotTime 见 §10.23.2.4，其中 16 µs 与 9 µs 取自 §17.4.4。' },
    { en: 'The internal collision rule — the higher category transmits, the lower invokes its backoff as after an external collision — is §10.23.2.2, which is also where the wait after a broken reception is given as EIFS − DIFS + AIFS[AC].',
      zh: '内部碰撞的规则——高优先级类别发送，低优先级类别按外部碰撞进入退避——见 §10.23.2.2；收到坏帧之后的等待写作 EIFS − DIFS + AIFS[AC]，同样出自该条。' },
    { en: 'The seed, the three stations, their traffic profiles and the capture margin that decides which of two overlapping preambles a radio locks onto are model choices of this simulator, not values from the standard.',
      zh: '随机种子、三台站点、它们的业务模型，以及决定“两个重叠前导里锁住哪一个”的捕获余量，都是本仿真器的模型取值，而非标准中的数值。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Caller (VO)', 'sta', 3.5, 5, 'he', 'voice'),
    node('sta-2', 'Uploader (BE)', 'sta', 6.5, 5, 'he', 'saturated'),
    node('sta-3', 'Backup (BK)', 'sta', 5, 6.5, 'he', 'backup'),
  ]),
  jumps: [
    J('first VO access', '第一次 VO 接入', firstVo),
    J('first background frame', '后台站点的第一帧', (r) => r.type === 'TX_START' && r.node === 'sta-3' && r.frame.kind === 'data'),
    J('first EIFS on the uploader', '上传站点的第一次 EIFS', (r) => r.type === 'IFS_START' && r.node === 'sta-2' && r.kind === 'EIFS'),
  ],
  observe: [
    { en: 'Hover the caller’s countdown blocks: they are marked AC_VO and the window on them is never wider than 7. The backup’s say AC_BK, never narrower than 15, above a silence of 79 µs.', zh: '把鼠标悬在通话站点的倒数色块上：它们标着 AC_VO，块上的窗口从不宽过 7。备份站点的块标着 AC_BK，从不窄于 15，而且上面那段静默是 79 µs。' },
    { en: 'Jump to the backup’s first frame: it is 55 ms into the run. The uploader has been sending since 0.088 ms, and the caller first speaks at 23 ms.', zh: '跳到备份站点的第一帧：它落在整轮的第 55 ms。上传站点从 0.088 ms 起就一直在发，而通话站点第一次开口是在 23 ms。' },
    { en: 'Over 300 ms the caller draws a countdown 33 times and the backup only 14 — and the backup’s frames still wait about seven times longer in their queue.', zh: '在 300 ms 里，通话站点抽了 33 次倒数，备份站点只抽了 14 次——可备份站点的帧在队列里等的时间，依然是通话的约七倍。' },
  ],
  tryThis: [
    { en: 'Turn EDCA off on the caller in the features panel and reload. It falls back to one queue with the old fixed wait and the old wide window, and its frames wait about two and a half times longer.', zh: '在功能面板里关掉通话站点的 EDCA 再载入。它退回成单队列，用回那段旧的固定等待和旧的宽窗口，它的帧要多等大约两倍半的时间。' },
    { en: 'Change the uploader’s traffic to voice as well and reload: two voice queues now draw from the same tiny range, and they collide with each other far more often than before.', zh: '把上传站点的业务也改成语音再载入：两条语音队列现在从同一个极小的范围里抽数，它们互相碰撞的频率比之前高得多。' },
  ],
  quiz: [
    {
      q: { en: 'How does the voice queue actually get ahead of the background queue?', zh: '语音队列究竟是怎么跑到后台队列前面的？' },
      options: [
        { en: 'The access point serves voice stations first', zh: '接入点优先服务语音站点' },
        { en: 'It hears a shorter silence before counting, and draws its countdown from a narrower range', zh: '它开始倒数前要听的静默更短，而且倒数值是从更窄的范围里抽的' },
        { en: 'Voice frames push aside whatever is already being sent', zh: '语音帧可以把正在发送的东西挤开' },
      ],
      answer: 1,
      explain: { en: 'Two numbers, no scheduler: a class that may start counting sooner and from a smaller number reaches zero sooner, most of the time.', zh: '两个数，没有调度器：一个能更早开始数、又从更小的数开始数的类别，多数时候会更早数到零。' },
    },
    {
      q: { en: 'A voice frame is queued while a neighbour is halfway through a long burst. What happens to it?', zh: '一帧语音入队时，邻居正发到一串长突发的一半。它会怎么样？' },
      options: [
        { en: 'It interrupts the burst, because voice has priority', zh: '它打断那串突发，因为语音有优先级' },
        { en: 'It waits for the burst to end, then contends with a head start for the next turn', zh: '它等那串突发结束，然后带着抢跑的优势去争下一轮' },
        { en: 'It is dropped, because the channel is busy', zh: '它被丢掉，因为信道忙' },
      ],
      answer: 1,
      explain: { en: 'Priority is decided entirely in the silence between frames. Nothing in this mechanism can touch a transmission that has already started.', zh: '优先级完全是在帧与帧之间的静默里决出来的。这套机制里没有任何东西能动一下已经开始的传输。' },
    },
    {
      q: { en: 'What does the background class pay for everyone else’s head start?', zh: '为了别人的抢跑，后台这一类付出了什么？' },
      options: [
        { en: 'A lower data rate', zh: '更低的数据速率' },
        { en: 'The longest silence and the widest draw, so its frames sit in the queue far longer', zh: '最长的静默和最宽的抽取范围，于是它的帧在队列里待得久得多' },
        { en: 'Nothing: the classes never interfere', zh: '什么都没付：四个类别互不干扰' },
      ],
      answer: 1,
      explain: { en: 'There is one channel. Anything given to one class is taken from another — which is exactly what a backup is supposed to give up.', zh: '信道只有一条。给了某一类的东西，必然是从另一类身上拿的——而一次备份，本来就该让出这些。' },
    },
  ],
}
