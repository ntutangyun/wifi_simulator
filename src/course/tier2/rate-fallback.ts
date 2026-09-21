/**
 * Wi-Fi Tier 2 · M4 · Capacity knobs · How the sender climbs and falls.
 *
 * The second half of the rate-control split (plan ruling 2): the fallback rule
 * this simulator follows, how lopsided it is, where the failures that drive it
 * actually come from, and what one station's stretch below its ceiling costs
 * its neighbours. `rate` is the first half.
 *
 * It reuses `rate`'s own builder with no variant, so `rate-fallback` records
 * the same timeline and its line in tests/fixtures/lesson-hashes.json is a copy
 * of `rate`'s. Every number quoted below is pinned in
 * tests/course/rate-fallback.test.ts.
 */
import { type Lesson, N, firstData, firstRetry, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

export const rateFallback: Lesson = {
  id: 'rate-fallback',
  module: 3,
  title: { en: 'Rate fallback — how the sender climbs and falls', zh: '速率回退——发送端怎样往下掉、怎样爬回来' },
  why: {
    en: 'A sender that only knows "answered or not" still has to decide when to give up a rung and when to try for a better one. The rule most textbooks start from falls fast, on a couple of unanswered frames, and climbs back slowly, only after a long unbroken run of good ones. That lopsidedness is on purpose, and it is expensive: a station knocked down by bad luck spends a long stretch sending slowly, and while it does, everyone else in the room waits longer for a turn.',
    zh: '一台只知道“答了还是没答”的发送端，仍然得决定什么时候放弃一级、什么时候去试更高的一级。教科书通常从这样一条规则讲起：掉得快，几帧没答就往下掉；爬得慢，要连着好一长串成功才升回去。这种不对称是故意的，而且很贵：一台被坏运气打下去的站点，要用很长一段时间慢慢地发，而在这段时间里，屋里其他人每一次机会都得多等。',
  },
  outcomes: [
    { en: 'step the simulator’s fallback rule by hand and say where the rung goes next', zh: '用手把仿真器的回退规则走一遍，说出下一帧的级别会落在哪里' },
    { en: 'say why a fall is cheap to cause and slow to undo', zh: '说清为什么“掉下去”很容易，“爬回来”很慢' },
    { en: 'measure what one station’s stretch below its ceiling costs its neighbours', zh: '量出一台站点跑在上限之下的那段时间，让邻居付出了多少代价' },
  ],
  needs: ['rate', 'anomaly'],
  terms: [
    { term: 'ARF', plain: {
      en: 'auto rate fallback: the plain rule this simulator follows — two failures in a row step down, ten successes in a row step up',
      zh: '自动速率回退：本仿真器遵循的那条朴素规则——连续两次失败降一级，连续十次成功升一级',
    } },
    { term: 'excursion', plain: {
      en: 'a stretch of frames spent below the ceiling, from the step down until the climb back',
      zh: '一段跑在上限之下的帧，从降级那一刻起，到爬回上限为止',
    } },
  ],
  picture: [
    { kind: 'steps', heading: { en: 'The rule this simulator follows', zh: '本仿真器遵循的规则' }, items: [
      { en: 'Start at the ceiling.', zh: '从上限开始。' },
      { en: 'Two failed attempts in a row step the working rung down by one.', zh: '连续两次尝试失败，就把当前级别降一级。' },
      { en: 'Ten successful attempts in a row step it back up by one.', zh: '连续十次尝试成功，就把它升回一级。' },
      { en: 'It is never allowed above the ceiling, however long the run of successes.', zh: '无论连成多少次成功，都不允许超过上限。' },
    ] },
    { heading: { en: 'Two down, ten up', zh: '两次下去，十次上来' }, text: {
      en: 'That rule is ARF, and it is chosen here because every step it takes is legible on the timeline. Notice how lopsided it is. A couple of draws of bad luck take a rung away; only an unbroken run of ten good ones buys it back. And one stray loss part-way up the climb resets the count to nothing, so the sender starts the climb over from the beginning.',
      zh: '这条规则就是 ARF，选它是因为它走的每一步都能在时间轴上看清楚。注意它有多不对称：两次坏运气就夺走一级，而要买回来，得连成十次好的，中间一次都不能断。爬到一半时随便丢一帧，成功计数就清零，发送端只能从头再爬一遍。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first unanswered frame. Follow the far station from there: find the second failure in a row and watch the block after it come out longer. Then count the frames until it shortens again.',
      zh: '载入仿真，跳到第一帧没等到答复的地方，然后顺着远端站点往后看：找到连着的第二次失败，看它之后的那个方块明显变长；再数一数，要过多少帧它才重新变短。',
    } },
    { heading: { en: 'Where the failures come from', zh: '失败从哪里来' }, text: {
      en: 'Almost every failed attempt here begins as a tie. Two backoff counters reach zero in the same slot and both stations start talking at once. What happens next is capture: at the access point the near station’s signal is far the stronger, so its frame is decoded and answered and only the far station’s dies. Nothing on this timeline is drawn as a collision, because no reception at the access point ever failed.',
      zh: '这里几乎每一帧没等到答复，起点都是一次“撞车”：两个退避计数器在同一个时隙清零，两台站点同时开口。接下来发生的是捕获效应——在接入点处，近端站点的信号强得多，于是它的帧被解出来并得到答复，死掉的只有远端那一帧。这条时间轴上一个碰撞标记也画不出来，因为接入点那边没有任何一次接收失败过。',
    } },
    { heading: { en: 'The bill lands on the neighbours', zh: '账单落在邻居头上' }, text: {
      en: 'A station on a lower rung holds the channel longer for the very same payload, and a busy channel freezes everybody else’s backoff counter where it stands. So a fall does not only cost the station that fell: every neighbour waits longer for a turn it had already won. That is the performance anomaly again — arriving this time as a state the sender can climb out of, rather than as a fixed fact about distance.',
      zh: '跑在更低一级的站点，为同样的内容要占住信道更久；而信道一忙，其他人的退避计数器就原地冻结。所以一次跌落的代价不只由跌下去的那台站点承担：每一个邻居，为自己早就赢到的那次机会，都要多等。这正是速率异常又一次出现——只不过这一次，它是发送端能自己爬出来的一种状态，而不是距离带来的固定事实。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'Three seconds of the far station: attempts, and how many of them failed',
      zh: '远端站点的三秒：尝试次数，以及其中失败了多少次',
    }, head: [
      { en: 'Rung', zh: '级别' }, { en: 'Attempts', zh: '尝试次数' },
      { en: 'Failed', zh: '失败次数' }, { en: 'Per attempt', zh: '每次尝试的失败率' },
    ], rows: [
      [{ en: 'MCS 2 — its ceiling', zh: 'MCS 2——它的上限' }, N('2,396'), N('266'), N('11.1%')],
      [N('MCS 1'), N('517'), N('61'), N('11.8%')],
      [{ en: 'MCS 0 — the bottom rung', zh: 'MCS 0——最底一级' }, N('90'), N('10'), N('11.1%')],
    ] },
    { kind: 'table', heading: {
      en: 'Below the ceiling, over the same three seconds',
      zh: '同样这三秒里，跑在上限之下的情况',
    }, head: [
      { en: 'What', zh: '项目' }, { en: 'Count', zh: '数值' },
    ], rows: [
      [{ en: 'Excursions below the ceiling', zh: '跌到上限以下的次数' }, N('25')],
      [{ en: 'Of those, ones reaching the bottom rung', zh: '其中一直跌到最底一级的' }, N('6')],
      [{ en: 'Frames each of those six lasted', zh: '这六次各持续了多少帧' }, N('10, 10, 10, 13, 19, 28')],
      [{ en: 'Shortest climb the rule allows', zh: '规则允许的最短爬升' }, { en: '10 frames', zh: '10 帧' }],
    ] },
    { heading: { en: 'What the excursions cost in air', zh: '这些跌落花掉了多少空口时间' }, text: {
      en: 'Below-ceiling frames are 20.2% of what the far station sends but 29.7% of the air it occupies: 530.3 ms, where those same frames at the ceiling would have taken 318.1 ms.',
      zh: '跑在上限之下的帧，只占远端站点发出帧数的 20.2%，却占了它空口时间的 29.7%：530.3 ms——而同样这些帧若跑在上限上，只要 318.1 ms。',
    } },
    { kind: 'table', heading: {
      en: 'How long the near station’s backoff is held behind one far-station frame — from the freeze to the slot it resumes in, not the frame’s airtime',
      zh: '近端站点的退避，被一个远端站点的帧冻结多久——从冻住算到恢复的那个时隙，而不是那帧的空口时间',
    }, head: [
      { en: 'That frame’s rung', zh: '那一帧的级别' }, { en: 'Backoff held for', zh: '退避被冻结' },
    ], rows: [
      [{ en: 'MCS 2 — the ceiling', zh: 'MCS 2——上限' }, N('615.0 µs')],
      [N('MCS 1'), N('859.8 µs')],
      [{ en: 'MCS 0 — the bottom rung', zh: 'MCS 0——最底一级' }, N('1,579.0 µs')],
      [{ en: 'Ceiling to bottom rung: extra wait, per frame', zh: '从上限到最底一级：每帧多等' }, N('964.0 µs')],
    ] },
    { heading: { en: 'The tax, in one line', zh: '这笔税，一句话说清' }, text: {
      en: 'The extra air those excursions burn comes to 212.2 ms — 7.1% of the whole run, spent carrying nothing at all.',
      zh: '这些跌落多烧掉的空口时间合计 212.2 ms——占整段仿真的 7.1%，而且没有多送出一个比特。',
    } },
  ],
  deeper: [
    { heading: { en: 'The death spiral that is not there', zh: '并不存在的那个死亡螺旋' }, text: {
      en: 'It is tempting to close the loop the other way: a slower frame sits on the air longer, so surely it is more exposed, so the station loses more and gets slower still. Measure it and the spiral is not there. The per-attempt failure rate barely moves across the three rungs — 11.1% at the ceiling, 11.8% at MCS 1, 11.1% at MCS 0 — and the longest frames of all are not the worst off. The reason is the freeze rule from the backoff lesson: a backoff counter does not tick down during somebody else’s frame. It stops the instant the medium goes busy and resumes at exactly the same value — all 2,666 of the near station’s freezes in this run come back at the value they went in at. A longer frame therefore gives the other counter no extra time to reach zero; it gives it none. What decides a failure is whether the two counters hit zero in the same slot, and that is settled before either frame is sent. (One exception proves the rule, and it comes from the engine rather than the standard: when the two do start together, the near station never detects the far preamble, because its own transmitter was busy at that instant. It counts straight through the far frame and starts a second one inside it — but that far frame was already lost when they started together, so nothing is added to the loss. The ninety MCS 0 attempts are also far too few to read a trend into; what matters is that the spiral’s direction is simply not in the data.)',
      zh: '很容易把这个回路反过来接：帧发得越慢，在空口上待得越久，想必更容易被撞上，于是丢得更多、更慢。可一量就会发现，这个螺旋并不存在。每次尝试的失败率在三个级别上几乎不动——上限上 11.1%，MCS 1 上 11.8%，MCS 0 上 11.1%——而最长的那些帧并不是处境最差的。原因是退避那一课的冻结规则：退避计数器在别人发帧期间并不倒数。介质一转忙它就停住，空下来再从同一个数值继续——这段仿真里近端站点的 2,666 次冻结，无一例外都是以进去时的那个值出来的。所以更长的帧并不会给对方的计数器多出时间走到零，而是根本不给。决定一次失败的，是两个计数器会不会在同一个时隙清零，而这在两帧发出之前就已定下。（有一个例外恰好印证了这条规则，它来自引擎而不是标准：两帧真的同时起跑时，近端站点根本没检测到远端的前导码——那一瞬间它自己的发射机正忙着。于是它笔直地数过远端那一帧，甚至在它中间发出第二帧；但那一帧在同时起跑的那一刻就已经没了，所以并没有多丢什么。另外，MCS 0 上那九十次尝试也太少，读不出什么趋势；要紧的是，螺旋所需要的那个方向，数据里根本没有。）',
    } },
    { heading: { en: 'How a failure shows on the timeline', zh: '失败在时间轴上长什么样' }, text: {
      en: 'Over the three seconds 337 of the far station’s attempts fail, and they do not all look alike on screen. 254 of them end in an ACK timeout record: the answer was due, nothing was arriving, and the station gave up waiting. The other 83 fall at the end of a frame of somebody else’s that the station was already receiving when its own answer came due — it finishes that reception, finds no answer of its own in it, and retries. Both call `onFailure` exactly once, which is why the rule above replays the run attempt for attempt only when both are counted.',
      zh: '这三秒里远端站点有 337 次尝试失败，而它们在屏幕上并不长一个样。其中 254 次以一条 ACK 超时记录收场：该来的答复没来，站点等不下去了。另外 83 次落在别人某一帧的末尾——答复该到的时候，这台站点正在接收那一帧；它把那一帧收完，发现里面没有属于自己的答复，于是重传。两种情况都恰好调用一次 `onFailure`，所以上面那条规则只有在两种都算上时，才能一次不差地复现整段仿真。',
    } },
    { heading: { en: 'What a production driver does instead', zh: '真实产品驱动改用什么做法' }, text: {
      en: 'No shipping driver runs this rule. They estimate a packet error rate over a moving window of recent attempts and pick the rung with the best expected throughput, which lets them jump several rungs at once instead of climbing one per ten successes, and lets them weigh a rung they have not tried lately. Read the four steps above as this simulator’s rule, not as what your laptop is doing.',
      zh: '没有哪个出货的驱动在跑这条规则。它们会在最近若干次尝试的滑动窗口上估计丢包率，再挑期望吞吐最高的那一级——这样可以一次跳好几级，而不必“十次成功爬一级”，也能对一个最近没试过的级别做出权衡。请把上面那四步读作本仿真器的规则，而不是你笔记本正在做的事。',
    } },
  ],
  sources: [
    { en: 'Auto rate fallback is the textbook algorithm of Kamerman and Monteban’s WaveLAN-II paper (1997), not anything IEEE Std 802.11-2024 defines: the standard leaves rate selection entirely to the implementer. The two-down/ten-up thresholds are this simulator’s model choice, picked so every step is visible on a timeline.',
      zh: '自动速率回退是 Kamerman 与 Monteban 1997 年 WaveLAN-II 论文里的教科书算法，并非 IEEE Std 802.11-2024 定义的任何东西：标准把速率选择完全留给实现者。“两次降一级、十次升一级”这两个门限是本仿真器的模型取值，这样选是为了让每一步都能在时间轴上看见。' },
    { en: 'The freeze behind a busy medium is §10.23.2.4: the backoff counter is suspended while the medium is determined busy and resumes with the value it held. The 45 µs the far station waits before calling an attempt failed is the simulator’s ACK timeout, a model choice sized from SIFS plus the ACK.',
      zh: '“介质忙时冻结”见 §10.23.2.4：介质被判为忙时退避计数器挂起，恢复时沿用它原来的值。远端站点判定一次尝试失败前等的那 45 µs 是本仿真器的 ACK 超时，属于模型取值，按 SIFS 加上一个 ACK 的长度定出来。' },
    { en: 'Capture is the simulator’s receiver model rather than a clause: a preamble detected clear of everything else is decoded if the ratio holds for the whole frame, which at 40 dB of margin it does. The standard states the per-rung sensitivities (Clause 36) but not what a receiver must do with two overlapping frames.',
      zh: '捕获效应出自本仿真器的接收机模型而非某个条款：一段被干净检测到的前导，只要整帧期间比值撑得住就会被解出来，而在 40 dB 余量下它撑得住。标准给出的是各级灵敏度（第 36 章），并没有规定接收机遇到两帧重叠时必须怎么做。' },
  ],
  scenario: () => rateScenario(),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK timeout', '第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('first retry', '第一次重传', firstRetry),
  ],
  observe: [
    { en: 'Six times in this run the far station reaches the bottom rung. Ten frames is the fastest climb the rule allows and three of the six manage it; the others last 13, 19 and 28 frames, because a fresh loss reset the count part-way up.', zh: '这段仿真里远端站点六次跌到最底一级。十帧是规则允许的最快爬升，六次里有三次做到了；其余三次分别持续 13、19、28 帧，因为爬到一半又丢了一帧，把计数清零了。' },
    { en: 'Every change of length is one rung: the far station never skips a step, going down or coming back up.', zh: '每一次长度变化都只差一级：远端站点无论往下掉还是爬回来，从不跳级。' },
    { en: 'No collision marker appears anywhere on this timeline, and the near station loses nothing in three seconds: 4,010 frames, not one ACK timeout. Capture hands it every tie.', zh: '这条时间轴上一个碰撞标记也没有，而近端站点三秒里一帧未丢：4,010 帧，一次 ACK 超时也没有。捕获效应把每一次“撞车”都判给了它。' },
  ],
  tryThis: [
    { en: 'Open in the editor and add a third saturated uploader beside the near station. The far station now spends 26.3% of its frames on the bottom rung instead of 3.0% — nearly ten times as many, bought by one extra talker.', zh: '点“在编辑器中打开”，在近端站点旁边再加一台饱和上传的站点。远端站点落在最底一级的帧，从占 3.0% 变成占 26.3%——将近十倍，代价只是多了一个说话的人。' },
    { en: 'Move that third uploader somewhere else and it gets worse, not better: three other spots tried here all land between 36% and 43%. Crowding, not geometry, is what floors the rung.', zh: '再把这台新站点挪到别处，结果只会更糟而不会更好：这里试过的另外三个位置都落在 36% 到 43% 之间。把级别压到底的是“人多”，不是几何位置。' },
  ],
  quiz: [
    {
      q: { en: 'The far station’s signal has not changed, but its rung dropped two steps. What happened?', zh: '远端站点的信号没有变化，但它的级别降了两级。发生了什么？' },
      options: [
        { en: 'The ceiling itself fell by two rungs', zh: '上限本身降了两级' },
        { en: 'Four failed attempts in a row — it stepped down at the second failure, and again at the fourth', zh: '连续四次尝试失败——第二次失败时降一级，第四次失败时又降一级' },
        { en: 'The access point asked it for a lower rate to save power', zh: '接入点为了省电，要求它降低速率' },
      ],
      answer: 1,
      explain: { en: 'Two failures in a row step the rung down by one, and the signal-based ceiling never moves on its own. Two steps down means two pairs of failures: four in total.', zh: '连续两次失败降一级，而基于信号的上限本身不会自己动。降两级，就是两对失败，一共四次。' },
    },
    {
      q: { en: 'The far station’s bottom-rung frames last almost twice as long as its MCS 1 frames. Which of the two fails more often, per attempt?', zh: '远端站点在最底一级的帧，几乎是它 MCS 1 帧的两倍长。这两者里，哪一种每次尝试更容易失败？' },
      options: [
        { en: 'The bottom-rung ones — they sit on the air longer, so more backoff counters have time to reach zero while they do', zh: '最底一级的——它们在空口上待得更久，其间会有更多退避计数器来得及走到零' },
        { en: 'The MCS 1 ones, if anything: 11.8% against 11.1%. Frame length is not what sets the per-attempt failure rate', zh: '真要说的话是 MCS 1 的：11.8% 对 11.1%。决定每次尝试失败率的不是帧长' },
        { en: 'Exactly the same for both — failures depend only on how many stations there are', zh: '两者完全一样——失败只取决于有多少台站点' },
      ],
      answer: 1,
      explain: { en: 'The table barely moves: 11.1%, 11.8%, 11.1%. An attempt fails here when two backoff counters reach zero in the same slot and capture keeps the stronger signal, and that is settled before either frame goes out — whatever length it then turns out to have.', zh: '表里的数几乎不动：11.1%、11.8%、11.1%。这里一次尝试之所以失败，是因为两个退避计数器在同一时隙清零、而捕获效应只保住更强的那一个；这在两帧发出之前就已定下，与帧最后有多长无关。' },
    },
  ],
}
