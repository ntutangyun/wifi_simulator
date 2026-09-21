import { type Lesson, firstData, firstRetry, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

export const rate: Lesson = {
  id: 'rate',
  module: 3,
  title: { en: 'Rate adaptation — the loop that picks the speed', zh: '速率自适应——选择速率的那个回路' },
  body: [
    { text: {
      en: 'Two stations upload flat out to the same AP: one on the desk beside it, one in the far corner of the flat behind a brick wall. Signal strength sets a ceiling on how dense the far station’s modulation can be — here MCS 2, decided purely by distance and the wall. Everything below that ceiling is a choice, and the driver makes it from what actually happened to its own frames, not from the signal it measures.',
      zh: '两台终端都在向同一个 AP 满速上传：一台在它旁边的桌上，一台在公寓另一头、隔着一堵砖墙的角落里。信号强度给远端终端的调制密度定了一个上限——这里是 MCS 2，纯粹由距离和那堵墙决定。低于这个上限的一切都是“选择”，而驱动程序做这个选择靠的是自己的帧究竟发生了什么，而不是它测到的信号强度。',
    } },
    { kind: 'steps', heading: { en: 'The simulator’s rule', zh: '仿真器的规则' }, items: [
      { en: 'Start at the ceiling.', zh: '从上限开始。' },
      { en: 'Two failed attempts in a row step the working rate down one MCS.', zh: '连续两次尝试失败，就把当前速率降一档 MCS。' },
      { en: 'Ten successful attempts in a row step it back up one MCS.', zh: '连续十次尝试成功，就把它升回一档 MCS。' },
      { en: 'It is never allowed above the ceiling, however long the success streak.', zh: '无论连续成功多少次，都不允许超过上限。' },
    ] },
    { text: {
      en: 'That two-down/ten-up ladder is Auto Rate Fallback — the textbook algorithm, chosen here because every step it takes is legible on the timeline. Production drivers do not run it. They estimate a packet error rate over a moving window of recent attempts and pick the rate with the best expected throughput, which lets them jump several indices at once instead of climbing one rung per ten successes. Read the four rules as this simulator’s rule, not as what your laptop is doing.',
      zh: '“两次降一档、十次升一档”这个阶梯是自动速率回退（ARF）——教科书上的算法，这里选它是因为它走的每一步都能在时间轴上看清楚。真实的产品驱动并不跑它：它们在最近若干次尝试的滑动窗口上估计丢包率，再挑期望吞吐最高的那一档，因此可以一次跳好几档，而不必十次成功爬一级。请把上面四条读作本仿真器的规则，而不是你笔记本正在做的事。',
    } },
    { text: {
      en: 'Note also that these four rules now cover every exchange, not just single-user ones. An ACK or BlockAck arrives, or its timeout does, and either way that moves the rate — a downlink MU PPDU reports one outcome per member, success or failure, exactly as a single-user frame would. Over lesson 17’s OFDMA run the router sends 169 multi-user PPDUs carrying 492 parts addressed to phones, and the rate controller hears about every one: 620 outcome reports for those phones in total, 128 from ordinary single-user frames and 492 from multi-user parts (597 successes, 23 failures). A rate used only inside multi-user PPDUs therefore adapts too, exactly as a single-user one would.',
      zh: '还要注意，这四条规则现在覆盖的是每一次交换，不只是单用户交换。ACK 或 BlockAck 回来了，或者它的超时到了，两种情况都会推动速率——多用户下行 PPDU 里，每个成员都会各自上报一次成功或失败，跟单用户帧一模一样。在第 17 课的 OFDMA 那段仿真里，路由器发出 169 个多用户 PPDU、其中有 492 份是发给手机的，速率控制器对每一份都收到了上报：这些手机总共产生 620 次结果上报——128 次来自普通单用户帧，492 次来自多用户部分（597 次成功、23 次失败）。所以一档只在多用户 PPDU 里用到的速率，现在也会像单用户速率一样自适应。',
    } },
    { text: {
      en: 'Alone, the far station would sit at MCS 2 forever: nothing ever fails, so it never has a reason to drop, and the ceiling gives it nowhere higher to climb. What actually happens on this timeline is a station that shares the channel with another saturated uploader, and that is where the loop becomes visible: a lost frame costs an attempt, two lost attempts in a row lower the rate, and only an unbroken run of ten successes wins the step back. The loop is real and asymmetric — two draws of bad luck to fall, ten of good luck to recover — which is why the far station spends whole stretches of this run below a ceiling it could have been using: 25 excursions below MCS 2 in three seconds, six of which reach the bottom rung and last 10, 10, 10, 13, 19 and 28 frames.',
      zh: '如果只有它自己，远端终端会永远停在 MCS 2：从没有失败过，也就没有理由降速，而上限又让它没有更高的地方可爬。这条时间轴上真正发生的，是一台和另一台饱和上传终端共享信道的终端——回路正是在这里变得看得见：丢掉一帧就耗掉一次尝试，连续丢两次尝试就降一档速率，而想升回去只有一条路：不间断地连成十次成功。这个回路是真实存在的，而且不对称——两次坏运气就掉下去，要十次好运气才爬得回来——所以远端终端在这段仿真里会有整段整段的时间跑在它本可以用的上限之下：三秒里共有 25 次跌到 MCS 2 以下，其中六次一直跌到最底一档，分别持续了 10、10、10、13、19 和 28 帧。',
    } },
    { text: {
      en: 'On this run the far station’s frames take 524.0 µs at its MCS 2 ceiling, 768.8 µs one step down at MCS 1 and 1,476.0 µs at MCS 0 — the same 1,530 octets, almost three times the airtime at the bottom rung, because each step down halves or nearly halves the bits carried per symbol. The rate line says the same thing: 25.8 Mb/s becomes 17.2, then 8.6. Every fall is expensive twice over: once in the failed attempts that caused it, and again in every frame afterwards until it climbs back.',
      zh: '在这段仿真里，远端终端的帧在上限 MCS 2 上要 524.0 µs，降一档到 MCS 1 要 768.8 µs，掉到 MCS 0 则要 1,476.0 µs——同样的 1,530 字节，到了最底一档空口时间已经是将近三倍，因为每降一档，每符号能装的比特数就减半或接近减半。速率一行说的是同一件事：25.8 Mb/s 变成 17.2，再变成 8.6。每一次跌落都要付两遍代价：一遍是导致它的那些失败尝试本身，另一遍是此后每一帧，直到它爬回来为止。',
    } },
    { heading: { en: 'What a lower rate actually costs: airtime', zh: '低速率真正的代价：空口时间' }, text: {
      en: 'Airtime is the scarce thing in a room, and a lower rate spends more of it for the same payload. Over these three seconds the far station’s 607 below-ceiling frames — 517 at MCS 1 and 90 at MCS 0 — are only 20.2% of the frames it sends but 29.7% of the air it occupies: 530.3 ms, where the same 607 frames at MCS 2 would have taken 318.1 ms. The excursions cost 212.2 ms of extra channel time — 7.1% of the whole three seconds, spent carrying nothing extra. The bill does not stop at the far station either. Every one of those frames pins its neighbour: the near station’s backoff is held for 615.0 µs behind a ceiling frame, 859.8 µs behind an MCS-1 one and 1,579.0 µs behind an MCS-0 one, so a fall to the bottom rung makes the station on the desk wait 964.0 µs longer, per frame, for a turn it has already earned. That is the real penalty of a lower rate, and it is exactly lesson 6’s rate anomaly: one slow station taxing everybody through airtime.',
      zh: '房间里稀缺的东西是空口时间，而速率越低，同样的负载就要花掉越多的空口时间。这三秒里，远端终端跑在上限以下的 607 个帧（MCS 1 上 517 个，MCS 0 上 90 个）只占它发出帧数的 20.2%，却占了它空口时间的 29.7%：530.3 ms——而同样这 607 帧若跑在 MCS 2 上只需 318.1 ms。也就是说，这些跌落多花掉了 212.2 ms 的信道时间——相当于整整三秒里的 7.1%，而且没有多送出一个比特。账单还不止落在远端终端头上。它的每一帧都把邻居钉住：近端终端的退避在一个上限帧后面被冻结 615.0 µs，在一个 MCS 1 帧后面是 859.8 µs，在一个 MCS 0 帧后面则是 1,579.0 µs——一旦跌到最底一档，桌上那台终端每帧就要为自己早就挣到的那次机会多等 964.0 µs。这才是低速率真正的代价，而它正是第 6 课的速率异常：一台慢终端用空口时间向所有人收税。',
    } },
    { heading: { en: 'The intuition that is wrong here', zh: '在这里说不通的那个直觉' }, text: {
      en: 'It is tempting to close the loop the other way and make it a death spiral: a longer frame sits on the air longer, so surely it is more exposed, so the slow station loses more frames, so it gets slower still. Measure it and the spiral is not there. Over these three seconds the far station makes 2,396 attempts at its MCS 2 ceiling, of which 209 are lost — 8.7% — 517 attempts at MCS 1, of which 39 are lost (7.5%), and 90 at MCS 0, of which 6 are lost (6.7%). The ninety MCS-0 attempts are far too few to read a trend into, but the direction the spiral needs is simply not in the data: the longest frames are, if anything, the least often lost.',
      zh: '很容易把这个回路反过来接成一个死亡螺旋：帧越长，在空口上待得越久，那想必更容易被撞上，于是慢的终端丢得更多，于是更慢。可一测就会发现，这个螺旋并不存在。这三秒里，远端终端在上限 MCS 2 上尝试了 2,396 次，丢了 209 次——8.7%；在 MCS 1 上尝试 517 次，丢了 39 次（7.5%）；在 MCS 0 上尝试 90 次，丢了 6 次（6.7%）。MCS 0 上那 90 次尝试太少，读不出什么趋势，但螺旋所需要的那个方向，数据里根本没有：真要说的话，最长的帧反而丢得最少。',
    } },
    { text: {
      en: 'The reason is a rule from lesson 3. A backoff counter does not tick down during someone else’s frame. The moment the medium goes busy every counter freezes where it stands, and it resumes at exactly the same value when the medium clears (IEEE 802.11-2024 §10.23.2.4) — all 2,666 of the near station’s freezes in this run come back at the value they went in at. So a longer frame does not give the other station’s counter more time to reach zero; it gives it no time at all. What decides whether an attempt is lost here is whether the two counters hit zero in the same slot, and that is settled before either frame is sent — the airtime of the frame that follows plays no part in it. (One exception proves the rule, and it is in the engine rather than the standard: when they do start together, the near station never detects the far preamble, because its own transmitter was busy at that instant. It therefore counts straight through the far station’s frame and starts a second one inside it. But that far frame was already lost the moment the two started together, so nothing is added to the loss.)',
      zh: '原因是第 3 课里的一条规则：退避计数器在别人发帧期间是不倒数的。介质一转为忙，每个计数器就原地冻结，等介质空下来再从同一个数值继续（IEEE 802.11-2024 §10.23.2.4）——这段仿真里近端终端的 2,666 次冻结，无一例外都是以进去时的那个值出来的。所以更长的帧并不会给对方的计数器更多时间走到零，而是根本不给时间。在这里决定一次尝试会不会丢失的，是两个计数器会不会在同一个时隙清零，而这在两帧发出之前就已经定下了——随后那一帧要占多久空口，在这件事里不起任何作用。（有一个例外恰好印证了这条规则，它来自引擎而非标准：两帧真的同时开始时，近端终端根本没有检测到远端的前导码——那一瞬间它自己的发射机正忙着。于是它的计数器会笔直地数过远端那一帧，甚至在它中间发出第二帧。但那一帧在两者同时起跑的那一刻就已经没了，所以并没有多丢什么。）',
    } },
    { heading: { en: 'Back to lesson 3: where the failures come from', zh: '回到第 3 课：失败从何而来' }, text: {
      en: 'Every one of those lost attempts begins as lesson 3’s tie: two backoff counters reach zero in the same slot and both stations transmit at once — 246 of the far station’s 254 losses in this run start in the very same instant as a near-station frame. But it ends as lesson 6’s capture. At the AP the near station’s signal is 40 dB the stronger, so its preamble is detected with room to spare, its frame is decoded and acknowledged, and only the far station’s frame dies. That is why nothing on this timeline is drawn as a collision — no reception at the AP ever failed — and why the near station, in three seconds of contending, never loses a frame at all. The far station learns the only way it can: from the 45 µs ACK timeout it never gets. Lesson 3 stopped there — the contention window doubles and the station redraws. This lesson is what happens once enough of those losses land in a row: they no longer cost just one retry each, they start moving the working MCS.',
      zh: '这里丢掉的每一次尝试，开头都是第 3 课那种“撞车”：两个退避计数器在同一个时隙清零，两台终端同时发送——这段仿真里远端终端的 254 次丢失中，有 246 次就是与近端某一帧在同一瞬间起跑的。但结局是第 6 课的捕获效应：在 AP 处近端的信号要强出 40 dB，它的前导码绰绰有余地被检测到，帧被解出并得到 ACK，只有远端那一帧阵亡。这就是为什么这条时间轴上一个碰撞标记也看不到——AP 从来没有一次接收失败——也是为什么近端终端竞争了整整三秒，一帧也没丢。远端终端只能用唯一的方式知情：那个等不到的 45 µs ACK 超时。第 3 课讲到这里就停了——竞争窗口翻倍，终端重新抽签。这一课接着讲：当足够多次丢失连着发生时会怎样——它们不再只是各自赔上一次重传，而是开始推着当前速率走。',
    } },
    { heading: { en: 'Back to lesson 6', zh: '回到第 6 课' }, text: {
      en: 'Lesson 6’s rate anomaly assumed a station simply parked at a low, fixed rate by distance. This loop is where that low rate can come from even when distance alone would allow better: a run of bad luck at contention drags the working rate down, and until ten successes in a row buy it back, every frame it sends occupies the channel for up to three times as long — a station stuck slow, holding the air while it transmits, exactly as lesson 6 described. Two things are different here. The slowness is now a state the driver can climb back out of, rather than a fixed property of the distance. And the harm travels the same way it did in lesson 6 — through airtime, one station making everyone else wait — not through any extra losses of its own.',
      zh: '第 6 课的速率异常假设的是一台因为距离而被钉死在低速、固定速率上的终端。而这个回路展示了：即便距离本身还允许更高的速率，低速也可能是这样来的——竞争中一连串的坏运气把速率拖了下去，而在连成十次成功把它买回来之前，它发的每一帧最多要占用三倍长的信道时间——一台卡在低速的终端，发送时占着空口不放，和第 6 课描述的一模一样。这里有两点不同：一是这份“慢”现在是一个驱动程序能爬出来的状态，而不是距离带来的固定属性；二是危害传递的路径和第 6 课完全相同——通过空口时间，一台终端让所有人都多等——而不是靠它自己多丢了什么帧。',
    } },
  ],
  scenario: () => rateScenario(),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK timeout', '第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('first retry', '第一次重传', firstRetry),
  ],
  observe: [
    { en: 'The far station’s green blocks change length over the run: 524.0 µs at its MCS 2 ceiling, 768.8 one step down, 1,476.0 at MCS 0 — the rate is visibly moving, not fixed.', zh: '远端终端的绿色块在整个过程里长度会变：上限 MCS 2 上是 524.0 µs，降一档是 768.8 µs，MCS 0 上是 1,476.0 µs——速率明显在变化，不是固定的。' },
    { en: 'Six times in this run the far station falls all the way to MCS 0. Ten frames is the fastest possible climb back and three of the six manage it; the others last 13, 19 and 28 frames, because a fresh loss reset the success count partway through the climb.', zh: '这段仿真里远端终端一共跌到最底的 MCS 0 六次。十帧是能爬回去的最短时间，六次里有三次做到了；其余三次分别持续 13、19 和 28 帧，因为爬升途中又丢了一帧，把成功计数清零重来。' },
    { en: 'The near station, one metre from the AP, never moves at all: 4,010 frames in three seconds, every one of them at its MCS 11 ceiling. It wins every simultaneous start it takes part in, so the rate loop has nothing to react to — the whole cost of the contention lands on the far station.', zh: '离 AP 只有一米的近端终端则纹丝不动：三秒里 4,010 帧，全部跑在它的上限 MCS 11 上。它赢下了自己参与的每一次同时起跑，速率回路根本无事可做——竞争的代价全落在了远端终端身上。' },
  ],
  tryThis: [
    { en: 'Move the far station two metres closer to the AP in the editor. Half a metre does nothing at all — it crosses no modulation threshold, and the run comes back frame for frame identical. Two metres does: the ceiling rises from MCS 2 to MCS 3, the bottom rung falls from 3.0% of its frames to 0.3%, and it delivers 3,712 frames in the three seconds instead of 3,003. At five metres MCS 0 never occurs at all. Put it back, then add a third saturated uploader and watch the far station sink onto the bottom rung far more often: 26.3% of its frames with the newcomer beside the near station, and 36–42% at every other spot tried — ten times the 3.0% it spends there with one neighbour.', zh: '在编辑器里把远端终端朝 AP 挪近两米。挪半米什么也不会发生——它跨不过任何一档调制门限，整段仿真会一帧不差地重现。两米才管用：上限从 MCS 2 抬到 MCS 3，最底下那一档从占它 3.0% 的帧降到 0.3%，三秒里交付的帧数也从 3,003 涨到 3,712。挪到五米，MCS 0 干脆一次都不出现。再把它挪回原处，加一台饱和上传终端，看远端终端落到最底一档的频率大幅升高：把新终端放在近端终端旁边时占它 26.3% 的帧，换到试过的其他位置则在 36%–42% 之间——是只有一个邻居时那 3.0% 的十倍。' },
  ],
  quiz: [
    {
      q: { en: 'The far station’s signal has not changed, but its modulation dropped two steps. What happened?', zh: '远端终端的信号强度没有变化，但它的调制降了两档。发生了什么？' },
      options: [
        { en: 'The ceiling itself fell by two MCS indices', zh: '上限本身降了两档 MCS' },
        { en: 'Four failed attempts in a row — the controller stepped down at the second failure, and again at the fourth', zh: '连续四次尝试失败——控制器在第二次失败时降了一档，第四次失败时又降了一档' },
        { en: 'The AP requested a lower rate to save power', zh: 'AP 为了省电要求降低速率' },
      ],
      answer: 1,
      explain: { en: 'Two consecutive failures step the rate down one; the signal-based ceiling never moves on its own. Two steps down means two pairs of failures, four in total.', zh: '连续两次失败会让速率降一档；基于信号的上限本身不会自己变动。降两档意味着两对失败，一共四次。' },
    },
    {
      q: { en: 'The far station’s MCS 0 frames last almost twice as long as its MCS 1 frames. Which of the two is lost more often per attempt?', zh: '远端终端的 MCS 0 帧几乎是 MCS 1 帧的两倍长。这两种帧里，哪一种每次尝试的丢失率更高？' },
      options: [
        { en: 'The MCS 0 frames — they sit on the air longer, so more backoff counters have time to reach zero while they do', zh: 'MCS 0 的帧——它们在空口上待得更久，其间有更多退避计数器有时间走到零' },
        { en: 'The MCS 1 frames, if anything: 7.5% against 6.7% here. Frame length is not what sets the per-attempt loss rate', zh: 'MCS 1 的帧，真要说的话：这里是 7.5% 对 6.7%。决定每次尝试丢失率的不是帧长' },
        { en: 'Exactly the same rate for both — losses depend only on how many stations there are', zh: '两者完全一样——丢失只取决于有多少台终端' },
      ],
      answer: 1,
      explain: { en: 'A backoff counter does not tick down during someone else’s frame: it freezes when the medium goes busy and resumes at the same value (IEEE 802.11-2024 §10.23.2.4, and all 2,666 of the near station’s freezes in this run do exactly that). So a longer frame gives the other station’s counter no extra time to expire — it gives it none. A frame here is lost when the two counters reach zero in the same slot and the AP keeps the stronger of the two signals, and that is decided before either frame goes out, whatever length it then turns out to have. Measured over three seconds: 8.7% of the ceiling attempts are lost, 7.5% of the MCS-1 ones and 6.7% of the MCS-0 ones. The third answer has the right instinct but overshoots: the rates are not identical, and the number of stations is not the only thing that matters.', zh: '退避计数器在别人发帧期间是不倒数的：介质转忙时它冻结，之后从同一数值继续（IEEE 802.11-2024 §10.23.2.4——这段仿真里近端终端的 2,666 次冻结全都如此）。所以更长的帧不会给对方的计数器多出任何时间走到零，而是根本不给。在这里，一帧之所以丢失，是因为两个计数器在同一时隙清零、而 AP 只保住了两个信号中更强的那个——这在两帧发出之前就已定下，与帧最后有多长无关。三秒的实测：上限上的尝试丢了 8.7%，MCS 1 上丢了 7.5%，MCS 0 上丢了 6.7%。第三个选项方向是对的，但说过头了：两者的丢失率并不相同，终端数量也不是唯一起作用的因素。' },
    },
  ],
}
