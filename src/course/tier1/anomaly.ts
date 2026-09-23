/**
 * Wi-Fi Tier 1 · M2 · Channel access · Rate anomaly — fairness gone wrong.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the rules
 * hand out turns, not time; one slow talker takes about as many turns as the
 * fast one but holds the air far longer on each, so every station's throughput
 * sinks towards the slow one's. The capture-effect material — the decibel
 * table, the destroyed frame and the unexplained retry — is professional depth
 * and now lives in `deeper`.
 *
 * Every number quoted below is pinned in tests/course/anomaly.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical.
 */
import { type Lesson, N, longApartment, node, sc, firstData, J } from '../lessonKit'

export const anomaly: Lesson = {
  id: 'anomaly',
  module: 1,
  title: { en: 'Rate anomaly — fairness gone wrong', zh: '速率异常——“公平”的反面' },
  why: {
    en: 'The rules of channel access are scrupulously fair about one thing: whose turn it is next. Every station (STA) that always has something to send wins the air about as often as its neighbours. What the rules never measure is how long a turn lasts. A station far from the access point (AP) has to send slowly, so the same frame holds the air several times longer — and because the air is one shared clock, everyone else waits through it. The fast station ends up barely faster than the slow one.',
    zh: '信道接入的规则在一件事上一丝不苟地公平：下一轮该轮到谁。凡是手里总有东西要发的站点（STA），抢到空口的次数和邻居差不多。规则从不过问的是：一轮能持续多久。离接入点（AP）远的站点只能慢慢发，同样一个帧要把空口占住好几倍的时间——而空口是一只共用的钟，其他人只能干等。最后，快的那台也快不到哪里去。',
  },
  outcomes: [
    { en: 'say which kind of fairness the channel-access rules deliver, and which they do not', zh: '说清信道接入规则给的是哪一种公平、不给的是哪一种' },
    { en: 'read a station’s turns beside the slice of the clock it holds — that is its airtime share — and compare them', zh: '在同一轮仿真里，把一台站点的轮次和它占住的那一段时钟（也就是它的空口占比）放在一起比' },
    { en: 'predict what happens to a fast station’s throughput when a slow one joins the room', zh: '预测一台慢站点进屋之后，快站点的吞吐量会怎样' },
  ],
  needs: ['airtime', 'backoff'],
  terms: [
    { term: 'airtime share', plain: {
      en: 'the fraction of the clock one station’s own transmissions occupy',
      zh: '整段时钟里，被某一台站点自己的发送占掉的那一部分',
    } },
    { term: 'performance anomaly', plain: {
      en: 'the drop in everybody’s throughput caused by one station that has to send slowly',
      zh: '因为有一台站点只能慢慢发，导致所有人的吞吐量都掉下来的现象',
    } },
    { term: 'rate adaptation', plain: {
      en: 'a sender stepping down to a slower, sturdier coding after its frames keep failing',
      zh: '发送方在帧接连失败之后，退到更慢、更结实的编码上去',
    } },
  ],
  picture: [
    { heading: { en: 'Fair about turns', zh: '公平的是轮次' }, text: {
      en: 'Two stations, both with a queue that never empties, take turns for the air. Each waits out the required idle time, counts down its own random number of slots, and sends when the count reaches zero. Nothing in that procedure asks how big a frame is or how long it will take. Over a long run the two win the air about equally often, and that is exactly what the rules promise.',
      zh: '两台站点，队列都永远排不空，轮流上空口。每一台都先熬过规定的空闲时间，再数完自己抽到的那个随机的时隙数，数到零就发。这套流程里没有任何一步去问帧有多大、要发多久。跑得久了，两台抢到空口的次数差不多相等——规则承诺的，恰恰就是这个。',
    } },
    { heading: { en: 'But a turn is not a fixed length', zh: '可一轮的长短并不固定' }, text: {
      en: 'One of the two sits across the apartment, behind a wall. Its signal arrives at the access point weak, so it cannot use the quick, delicate coding the near station uses; it must fall back to a slower, sturdier one that packs fewer bits into each symbol. Same bytes, same frame — several times the airtime. And when its frames start failing, it steps down another rung — that is rate adaptation — making each turn longer still.',
      zh: '两台之中有一台在公寓的另一头，隔着一堵墙。它的信号到达接入点时已经很弱，用不了近端那种又快又娇气的编码，只能退到更慢、更结实的一档，每个符号装的比特更少。字节一样，帧也一样——空口时间却是好几倍。而当它的帧开始失败，它又会自己往下退一档——这就是速率自适应——于是每一轮更长了。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Put the two turns side by side', zh: '把两种轮次摆在一起看' }, text: {
      en: 'Load the simulation and jump to the first data frame. Both lanes start at the same instant. Now look at how far each green block reaches: the two carry the same number of bytes.',
      zh: '载入仿真，跳到第一个数据帧。两条泳道在同一瞬间起跑。现在看两个绿色块各自伸到哪里：它们装的字节数是一样的。',
    } },
    { heading: { en: 'The thing being shared is the clock', zh: '被分掉的其实是时钟' }, text: {
      en: 'Turns are handed out evenly, but each turn spends the one resource everybody needs: time on the air. The slow station’s long turns fill the clock, so fewer turns of any kind fit into a second — and the fast station, which could have had many short ones, gets far fewer. Its throughput falls even though nothing about its own link has changed.',
      zh: '轮次是均匀发下去的，可每一轮花掉的都是大家共用的那一样东西：空口上的时间。慢站点那些长长的轮次把时钟填满了，于是一秒钟里装得下的轮次总数变少——本可以跑很多个短轮次的快站点，拿到的轮次就少得多。它自己的链路什么都没变，吞吐量却掉了下来。',
    } },
    { heading: { en: 'Everyone sinks towards the slow one', zh: '所有人都被拉向慢的那一个' }, text: {
      en: 'Count airtime instead of turns and the picture inverts: the slow station holds most of the clock and the fast one a small corner of it. The fast station now delivers little more than the slow one does, which is a long way below what it managed with the room to itself. This is the performance anomaly, and it is not a bug in anyone’s radio — it falls straight out of sharing turns instead of sharing time.',
      zh: '不数轮次而数空口时间，画面就翻了过来：慢站点占住了时钟的大头，快站点只剩一个小角。这时快站点送出去的东西，并不比慢站点多多少，离它独占房间时的水平更是差了一大截。这就是性能异常——它不是谁家无线电的毛病，而是“分轮次而不分时间”这件事的必然结果。',
    } },
    { heading: { en: 'Nobody is misbehaving', zh: '没有谁在耍赖' }, text: {
      en: 'It is worth being clear about who is at fault, because the answer is nobody. The slow station is not greedy; it takes no more turns than it is entitled to, and it would love to be quicker. The fast station is not being cheated out of turns. The unfairness is in the unit: a rule written in turns cannot see the seconds it is spending.',
      zh: '有必要说清这事怪谁，因为答案是：不怪谁。慢站点并不贪心，它拿到的轮次一点没多，而且它自己也巴不得快一些。快站点也没有被少分轮次。不公平藏在单位里：一条按“轮次”写成的规则，看不见自己花掉的秒。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'Two hundred milliseconds in this apartment', zh: '这套公寓里的 200 ms' }, head: [
      { en: 'Station', zh: '站点' }, { en: 'Turns taken', zh: '拿到的轮次' }, { en: 'Mean turn', zh: '平均每轮' },
      { en: 'Airtime share', zh: '空口占比' }, { en: 'Delivered', zh: '送达' },
    ], rows: [
      [{ en: 'Near & fast', zh: '近端·快' }, N('209'), N('248 µs'), N('25.9 %'), N('12.8 Mb/s')],
      [{ en: 'Far & slow', zh: '远端·慢' }, N('154'), N('795 µs'), N('61.2 %'), N('8.3 Mb/s')],
    ] },
    { heading: { en: 'Where a turn’s length comes from', zh: '一轮的长短是怎么来的' }, kind: 'table', head: [
      { en: 'Frame', zh: '帧' }, { en: 'Rate', zh: '速率' }, { en: 'Bytes', zh: '字节' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [{ en: 'Near station, every frame', zh: '近端站点，每一帧' }, N('54 Mb/s'), N('1528'), N('248 µs')],
      [{ en: 'Far station, its best rate', zh: '远端站点，最好的一档' }, N('18 Mb/s'), N('1528'), N('704 µs')],
      [{ en: 'Far station, after stepping down twice', zh: '远端站点，连降两档之后' }, N('9 Mb/s'), N('1528'), N('1384 µs')],
    ] },
    { heading: { en: 'What the room costs the fast station', zh: '这间屋子让快站点付出了什么' }, text: {
      en: 'Delete the far station and the near one delivers 510 frames over the same 200 ms instead of 209. The far station is not taking its turns away — it is taking its clock. Left alone, the far station manages 234 frames of its own, which is more than either of them gets while they share the room.',
      zh: '把远端站点删掉，同样的 200 ms 里近端送出的就不是 209 帧，而是 510 帧。远端拿走的不是它的轮次，而是它的时钟。而远端若独占房间，自己能送出 234 帧——比两台共处一室时任何一台拿到的都多。',
    } },
    { kind: 'steps', heading: { en: 'From equal turns to unequal throughput, step by step', zh: '从“轮次相等”到“吞吐不等”，一步一步' }, items: [
      { en: 'Both stations always have a frame queued. Each waits for the air to stay idle for one DIFS: a 16 µs gap plus two slots of 9 µs, so 34 µs. A station that has just failed to decode a reception waits the longer EIFS instead.',
        zh: '两台站点手里永远有帧。每一台都先等空口连续安静一个 DIFS：一个 16 µs 的间隔加两个 9 µs 的时隙，合 34 µs。刚刚有一帧没能解出来的站点，等的则是更长的 EIFS。' },
      { en: 'Each then draws a whole number of slots at random between zero and its contention window, which starts at 15, and counts one off per idle slot. Both draw from the same window, so over a long run each reaches zero about as often as the other.',
        zh: '接着各自在 0 到自己的竞争窗口之间抽一个整数时隙数——窗口从 15 起步——每过一个空闲时隙就减一。两台抽的是同一个窗口，所以跑得久了，谁归零的次数都差不多。' },
      { en: 'Whoever reaches zero sends one frame. It is 1528 bytes either way, and it goes out at whatever rate that station’s own link supports. Nothing in the procedure has asked what that rate is.',
        zh: '谁先归零，谁就发一帧。两边都是 1528 字节，而用的是各自链路撑得住的那个速率。到这一步为止，流程从没问过这个速率是多少。' },
      { en: 'The length of the turn is how long those 1528 bytes take at that station’s own rate: 248 µs near, 795 µs on average at the far end. Every other counter in the room is frozen for the whole of it.',
        zh: '这一轮有多长，就是那 1528 字节按这台站点自己的速率发完要多久：近端 248 µs，远端平均 795 µs。这段时间里，屋里其余的计数器全都冻着。' },
      { en: 'The access point answers with a 14-byte acknowledgement, and the whole procedure starts over. Turns are handed out evenly; the seconds each turn spends are not.',
        zh: '接入点回一个 14 字节的确认帧，整套流程重新来过。轮次是均匀发下去的，每一轮花掉的那些秒却不是。' },
      { en: 'So a station’s throughput is its acknowledged turns per second times 1528 bytes times 8 bits. The turns per second is whatever the other station’s long turns left room for — which is how equal turns end in unequal throughput.',
        zh: '于是一台站点的吞吐量，就是它每秒被确认的轮次乘 1528 字节再乘 8 比特。而每秒能有几轮，取决于另一台的长轮次还给它剩下多少空当——相等的轮次，就是这样变成不等的吞吐量的。' },
    ] },
    { kind: 'table', heading: { en: 'The same 200 ms, run through the steps', zh: '同样的 200 ms，照着步骤算一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Near & fast', zh: '近端·快' }, { en: 'Far & slow', zh: '远端·慢' },
    ], rows: [
      [{ en: 'turns won in 200 ms', zh: '200 ms 内抢到的轮次' }, N('209'), N('154')],
      [{ en: 'airtime per turn', zh: '每轮的空口时间' }, N('248 µs'), N('795 µs')],
      [{ en: '= airtime held', zh: '= 占住的空口时间' }, N('51.8 ms · 25.9 %'), N('122.4 ms · 61.2 %')],
      [{ en: 'of those turns, acknowledged', zh: '这些轮次里被确认的' }, N('209'), N('135')],
      [{ en: '= frames delivered per second', zh: '= 每秒送达的帧数' }, N('1045'), N('675')],
      [{ en: '× 1528 bytes × 8 bits', zh: '× 1528 字节 × 8 比特' }, N('12.8 Mb/s'), N('8.3 Mb/s')],
    ] },
    { heading: { en: 'Why the fourth row is not the first', zh: '第四行为什么不等于第一行' }, text: {
      en: 'The far station wins 154 turns but only 135 of them are acknowledged; the rest are destroyed outright, and the depth below takes that apart. Throughput counts what arrived, so it is the acknowledged turns that go into the last two rows.',
      zh: '远端站点抢到 154 轮，被确认的只有 135 轮，其余的整帧报废——后面“再深一层”会拆开讲。吞吐量算的是真正到达的东西，所以进入最后两行的是被确认的那些轮次。',
    } },
  ],
  deeper: [
    { heading: { en: 'The near station also wins every simultaneous start', zh: '近端站点还赢下了每一次同时起跑' }, text: {
      en: 'Watch the very first microsecond. Both stations find the medium idle from the start, so neither draws a backoff at all, and both transmit at t = 0 — a textbook collision. Yet the access point decodes the near station’s frame perfectly and acknowledges it, while the far station gets nothing. That is the capture effect, and the decibels below say why.',
      zh: '看第一个微秒。两台站点一开始就发现介质空闲，于是谁也没有抽退避，都在 t = 0 开始发送——一次教科书式的碰撞。可接入点把近端的帧完好地解了出来并回了确认，远端却颗粒无收。这就是捕获效应，下面的分贝数解释了原因。',
    } },
    { kind: 'table', head: [
      { en: 'Reception', zh: '接收' }, { en: 'Wanted signal', zh: '目标信号' }, { en: 'Interferer', zh: '干扰' },
      { en: 'Margin', zh: '余量' }, { en: 'Needed', zh: '所需' },
    ], rows: [
      [{ en: 'Near data at the access point', zh: '接入点收近端数据' }, N('−35 dBm'), { en: 'far station, −75 dBm', zh: '远端站点，−75 dBm' }, N('40 dB'), { en: '26 dB for 54 Mb/s', zh: '54 Mb/s 需 26 dB' }],
      [{ en: 'ACK at the near station', zh: '近端收 ACK' }, N('−30 dBm'), { en: 'far station still on air, −74 dBm', zh: '远端仍在发，−74 dBm' }, N('44 dB'), { en: '17 dB for the 24 Mb/s ACK', zh: '24 Mb/s 的 ACK 需 17 dB' }],
    ] },
    { heading: { en: 'Why the stronger preamble wins, not the earlier one', zh: '为什么赢的是更强的前导，而不是更早的' }, text: {
      en: 'The 40 dB gap is opened by 11 m of apartment and one brick wall. A receiver can decode nothing until it has detected a preamble, and a preamble is detected only if it stands at least 4 dB above everything else on the air. The near preamble clears that with 40 dB to spare, so the access point locks onto it; the far one is never detected and only adds interference. Once locked, a receiver treats everything arriving afterwards as noise — though while it is still acquiring, a markedly stronger preamble makes it abandon the reception and re-sync to the newcomer.',
      zh: '这 40 dB 是 11 m 的房长加一道砖墙拉开的。接收机在检测到前导之前什么也解不出来，而前导只有比空中其他一切高出至少 4 dB 才会被检测到。近端的前导以 40 dB 的富余越过这道门槛，于是接入点锁定了它；远端的前导根本没被检测到，只是添了一份干扰。一旦锁定，接收机把此后到达的一切都当作噪声——不过在它还在捕获阶段时，一个明显更强的前导会让它丢掉手上的接收、改去同步新来者。',
    } },
    { heading: { en: 'A loss with no mark on the timeline', zh: '时间轴上不留痕迹的一次损失' }, text: {
      en: 'The far station’s 704 µs frame is destroyed in full. It learns nothing until its acknowledgement deadline expires at 749 µs, then retries with a doubled window. Nothing is drawn as a collision, because from the access point’s point of view no reception failed: the whole run records none. Fifteen of these silent losses hit the far station in 200 ms, and none at all hit the near one — so the slow station pays twice, holding the air longer per turn and losing every simultaneous start it takes part in.',
      zh: '远端站点那 704 µs 的帧被整帧毁掉。它要等到 749 µs 确认超时才知情，然后带着翻倍的窗口重传。时间轴上不会画出任何碰撞，因为在接入点看来没有任何一次接收失败：整轮跑下来一次都没记。200 ms 里远端挨了 15 次这样无声的损失，近端一次也没有——所以慢站点要付两遍：每轮占用的空口更长，还输掉它参与的每一次同时起跑。',
    } },
  ],
  sources: [
    { en: 'The performance anomaly of 802.11 is Heusse, Rousseau, Berger-Sabbatel and Duda, "Performance anomaly of 802.11b", IEEE INFOCOM 2003; the per-station fairness it starts from is the DCF access procedure of §10.3.4 of IEEE Std 802.11-2024.',
      zh: '802.11 的性能异常出自 Heusse、Rousseau、Berger-Sabbatel 与 Duda 的《Performance anomaly of 802.11b》（IEEE INFOCOM 2003）；它作为前提的“每站公平”，即 IEEE Std 802.11-2024 §10.3.4 的 DCF 接入流程。' },
    { en: 'The rates, the 1528-byte frames and the airtimes are this simulator’s own OFDM model; the −82 dBm detection floor, the 4 dB preamble-detection margin and the wall losses are model choices, and every count above is reproducible from the scene’s seed.',
      zh: '这里的速率、1528 字节的帧长与各自的空口时间，出自本仿真器自己的 OFDM 模型；−82 dBm 的检测底、4 dB 的前导检测余量和墙体损耗都是模型取值，上面每一个计数都可由场景的随机种子复现。' },
    { en: 'Capture — a receiver holding the first preamble it locked and re-syncing only to a markedly stronger one — is not mandated by the standard; it is the behaviour of real receivers and is modelled here explicitly.',
      zh: '捕获效应——接收机守住它锁定的第一个前导，只有遇到明显更强的前导才改同步——并非标准强制规定，而是真实接收机的行为，本仿真器把它显式建模了出来。' },
  ],
  scenario: () => sc(longApartment(), [
    node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle'),
    node('sta-1', 'Near & fast', 'sta', 4.8, 4.3, 'nonht', 'saturated'),
    node('sta-2', 'Far & slow', 'sta', 15, 7, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
  ],
  observe: [
    { en: 'The far station’s green blocks are much longer than the near one’s, and they come in three lengths — 704, 1044 and 1384 µs — as rate adaptation steps it down. Same bytes every time.', zh: '远端站点的绿色块比近端的长得多，而且有三种长度——704、1044、1384 µs——那是速率自适应一档档把它调下去的结果。字节数每次都一样。' },
    { en: 'Inspector: the two take a comparable number of turns in the first 200 ms, 209 and 154, yet the far station holds more than twice the airtime the near one does.', zh: '检视器：前 200 ms 里两者拿到的轮次相当，209 次与 154 次，可远端占用的空口时间是近端的两倍多。' },
    { en: 'The near station’s throughput is far below what it gets alone: 209 frames delivered in 200 ms here, 510 with the far station removed. Together the two hold the air more than nine tenths of the time, and still deliver less than the near station did by itself.', zh: '近端站点的吞吐量远低于它独占信道时的水平：这里 200 ms 送达 209 帧，把远端删掉则是 510 帧。两台加在一起把空口占住了九成以上的时间，送达的量却还不如近端自己一台的时候。' },
  ],
  tryThis: [
    { en: 'Delete the far station in the editor and reload. The near one’s delivered frames jump from 209 to 510 in 200 ms — it gained nothing but the clock it was waiting through.', zh: '在编辑器里删掉远端站点后重新载入。近端在 200 ms 内送达的帧数从 209 跳到 510——它多得到的只有原先干等掉的那段时钟。' },
    { en: 'Move the far station closer to the access point, a metre at a time, and watch its green blocks shorten in steps as the rate climbs — and the near station’s count climb with them.', zh: '把远端站点一米一米地往接入点挪，看它的绿色块随着速率爬升而一级级变短——近端的帧数也跟着一起涨。' },
  ],
  quiz: [
    {
      q: { en: 'The channel-access rules give each always-busy station roughly equal…', zh: '信道接入规则给每台“总有东西要发”的站点大致相等的是……' },
      options: [
        { en: 'airtime', zh: '空口时间' },
        { en: 'throughput', zh: '吞吐量' },
        { en: 'numbers of turns', zh: '轮次数量' },
      ],
      answer: 2,
      explain: { en: 'Every station draws from the same window and wins a turn about as often as the others. What each turn then costs in time is left entirely to that station’s rate.', zh: '每台站点都从同一个窗口里抽数，抢到轮次的频率彼此相当。至于一轮要花掉多少时间，那完全取决于各自的速率。' },
    },
    {
      q: { en: 'Why does the near station’s throughput fall when the far one joins the room?', zh: '远端站点一进屋，近端的吞吐量为什么会掉？' },
      options: [
        { en: 'Its own signal has become weaker', zh: '它自己的信号变弱了' },
        { en: 'It is being given fewer turns than the far station', zh: '分给它的轮次比远端少' },
        { en: 'Each of the far station’s turns holds the air for a long time, so fewer turns of any kind fit into a second', zh: '远端的每一轮都把空口占住很久，于是一秒钟里装得下的轮次总数变少了' },
      ],
      answer: 2,
      explain: { en: 'Its link is untouched and its share of the turns is if anything the larger one. What it lost is the seconds those long turns spend.', zh: '它的链路毫发无损，轮次的份额甚至还更多一些。它丢掉的，是那些长轮次花掉的秒。' },
    },
  ],
}
