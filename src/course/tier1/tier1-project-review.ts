/**
 * Tier 1 · project · "Reading the results, and the write-up".
 *
 * The second half of the Tier 1 project, split from `tier1-project` under the
 * zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The first
 * half is every number the learner predicts with a pencil; this one is every
 * number the run gives back, the two mechanisms that explain most of the gap
 * between them, the residual that stays unexplained, and the rubric a good
 * write-up is marked against.
 *
 * It loads `tier1-project`'s own scene and its three variants — the same
 * builder, the same array — so the two ids replay to the same recorded
 * timeline hashes and the split costs the reader nothing.
 *
 * Every measurement quoted below comes from a 10 s run in
 * tests/course/tier1-project-review.test.ts; every prediction it is compared
 * against is recomputed there from the engine's own functions.
 */
import { type Lesson, N } from '../lessonKit'
import { projectFlat, projectJumps, projectVariants } from './tier1-project'

export const tier1ProjectReview: Lesson = {
  id: 'tier1-project-review',
  module: 1,
  title: {
    en: 'Project — reading the results',
    zh: '项目——读懂结果',
  },
  why: {
    en: 'Now open the run. Some of your four predictions will land and some will not, and the ones that miss are worth more than the ones that hit. This half puts the plan and the run side by side, names the two mechanisms behind most of the difference, and sizes each in the simulator’s own units. What is left is reported honestly rather than argued away — the part of the exercise that carries over to real measurements.',
    zh: '现在可以打开仿真了。你的四个预测有的会命中，有的不会；而没中的那些，比中了的更值钱。这后半程把计划和实跑并排摆开，点名造成大部分差距的两个机制，并用仿真器自己的单位把它们各自定量。剩下的那一部分，如实报出来，而不是辩过去——这恰恰是这次练习里能带到真实测量中去的那一半。',
  },
  outcomes: [
    { en: 'lay four runs beside four predictions and say where each one broke', zh: '把四次实跑与四个预测并排摆开，说出每一个是在哪里失手的' },
    { en: 'tell the quantity you meant apart from the quantity the screen counts', zh: '把你心里那个量，和屏幕真正在数的那个量区分开' },
    { en: 'name a mechanism, size it in the model’s own units, and report what is left', zh: '点名一个机制，用模型自己的单位给它定量，并如实报出剩下的部分' },
    { en: 'write the project up so somebody else could check every line of it', zh: '把项目写成别人能逐行核对的样子' },
  ],
  needs: ['tier1-project', 'hidden', 'anomaly'],
  terms: [
    { term: 'estimator', plain: {
      en: 'the thing you actually count on screen, standing in for the quantity you meant',
      zh: '你在屏幕上真正数的那样东西，用来代替你心里想要的那个量',
    } },
  ],
  picture: [
    { heading: { en: 'Four runs, one sheet', zh: '四次实跑，一张纸' }, text: {
      en: 'Run the flat, then the three variants, and write each result on the sheet beside the prediction it belongs to. Do not adjust anything yet. Two of the four quantities come back almost exactly as planned; the other two are out by enough that something in the plan must be named as wrong.',
      zh: '载入这户人家，跑一遍，再把三个变体各跑一遍，把每个结果写到纸上它对应的那个预测旁边。先别急着改任何东西。四个量里有两个几乎分毫不差地回来了；另外两个差得足够多，多到必须指名道姓地说出计划里哪一处错了。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Watch the first collision', zh: '看第一次碰撞' }, text: {
      en: 'Jump to the first collision and then step backwards through the first millisecond. Both laptops start together, the short frame finishes long before the long one, and then the short-frame station (STA) comes back — on top of a frame that is still running.',
      zh: '跳到第一次碰撞，然后在第一毫秒里往回步进。两台笔记本一起起跑，短帧远早于长帧结束；接着发短帧的那台站点（STA）又回来了——踩在一个还在进行中的帧上。',
    } },
    { heading: { en: 'When agreement is not agreement', zh: '“一致”不一定是一致' }, text: {
      en: 'Your collision figure and the retry figure on screen look close enough to shake hands. They are not the same thing. A retry counts a frame that was lost; an overlap counts two frames that met. Where one laptop arrives far stronger than the other, the stronger frame is decoded anyway — that is capture — so the screen counts fewer losses than there were meetings. Name the thing you are counting — that is the estimator — before you compare anything.',
      zh: '你算出的碰撞数，和屏幕上的重传数，看上去近得可以握手言和。但它们不是同一件事。重传数的是“丢掉的帧”，重叠数的是“撞在一起的两个帧”。在一户两台笔记本到达强度相差悬殊的房子里，较强的那一帧照样被解了出来——这就是捕获——于是屏幕数到的损失，远少于实际发生的相遇。把你正在数的那样东西点名——这就是估计量——然后再去比较。',
    } },
    { heading: { en: 'An assumption that fails one way round', zh: '一个只在一个方向上失效的假设' }, text: {
      en: 'The plan assumed both laptops hear each other. They do — faintly, and only while they are listening. A station that was transmitting when the other’s preamble arrived never caught it, and what is left is energy far too weak to hold CCA busy. So it finishes its wait, counts down and starts again, on top of a frame it can no longer hear.',
      zh: '计划假设两台笔记本彼此听得见。它们确实听得见——很微弱，而且只在它们正在听的时候。如果对方的前导到达时本机正在发送，它就永远抓不到那个前导；此后剩下的只有残余能量，而这点能量远不足以让 CCA 保持置忙。于是它熬完等待、数完倒数，又发了出去——正好压在一个它已经听不见的帧上。',
    } },
    { heading: { en: 'Three clocks for one event', zh: '一次事件，三个时钟' }, text: {
      en: 'The same instant is priced differently by everyone in the room. A station whose answer never came waits out its ACK timeout. One that locked onto a preamble and then failed to decode the frame must allow for an answer it cannot hear, and waits the longer EIFS. One that heard nothing waits the ordinary DIFS and carries on.',
      zh: '同一个瞬间，屋里每个人给它的定价都不一样。回答没等到的那台，要熬完自己的 ACK 超时。锁上了前导却解不出这一帧的那台，必须假定有一个它听不见的回答正在路上，于是要等更长的 EIFS。而什么也没听见的那台，等一个普通的 DIFS 就接着走。',
    } },
    { heading: { en: 'What is still missing, and the write-up', zh: '还差的那一点，以及写报告' }, text: {
      en: 'Two named mechanisms account for most of the gap, and rate control for most of what is left: every frame on screen is longer than the one you priced, because a sender that keeps failing steps down and cannot tell a collision from a fading link. A couple of points still remain. Report them as a residual — saying so is part of the answer, not a failure of it.',
      zh: '两个点了名的机制解释了大部分差距，而剩下的大部分要记在速率控制头上：屏幕上每个帧都比你定价的那个略长，因为接连失败的发送方会往下降档，而它分不清碰撞与衰落。把这些都算完，还剩下两个百分点左右。把它们当作残差报出来。说出这一点是答案的一部分，而不是答案的缺陷。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'Predicted against measured, ten seconds of the flat', zh: '预测对实测：这户人家的十秒钟' }, head: [
      { en: 'Quantity', zh: '量' }, { en: 'Predicted', zh: '预测' }, { en: 'Measured', zh: '实测' },
    ], rows: [
      [{ en: 'Rung', zh: '等级' }, N('MCS 13 / MCS 2'), N('MCS 13 / MCS 2')],
      [{ en: 'Data frame', zh: '数据帧' }, N('129.6 / 524.0 µs'),
        { en: 'run means 148.1 / 600.9 µs', zh: '全程均值 148.1 / 600.9 µs' }],
      [{ en: 'Collision chance', zh: '碰撞概率' }, N('10.46 %'),
        { en: '23.15 % of attempts overlap; 12.59 % end in a retry', zh: '23.15 % 的尝试重叠；12.59 % 以重传收场' }],
      [{ en: 'Delivered together', zh: '合计交付' }, N('25.585 Mb/s'), N('22.610 Mb/s')],
      [{ en: 'Frames each', zh: '各自帧数' }, { en: 'equal', zh: '相同' }, N('9,719 / 9,123')],
      [{ en: 'Airtime split', zh: '空口占比' }, N('19.8 % / 80.2 %'), N('21.2 % / 78.8 %')],
      [{ en: 'Study laptop alone', zh: '书房笔记本独占' }, N('43.621 Mb/s'), N('42.470 Mb/s')],
    ] },
    { kind: 'table', heading: { en: 'The three variants, run', zh: '三个变体，跑出来的结果' }, head: [
      { en: 'Variant', zh: '变体' }, { en: 'Predicted', zh: '预测' }, { en: 'Measured', zh: '实测' }, { en: 'Why', zh: '成因' },
    ], rows: [
      [{ en: 'Study laptop to the living room', zh: '书房笔记本搬到客厅' }, N('19.350 Mb/s · 10.46 %'),
        N('16.796 = 8.737 + 8.059 Mb/s · 11.10 %'),
        { en: 'both frames long and alike: the late start nearly vanishes', zh: '两个帧都长且相近：迟到起跑几乎消失' }],
      [{ en: 'A tablet joins', zh: '多一台平板' }, N('29.574 Mb/s · 17.81 %'),
        N('21.184 = 7.734 + 5.852 + 7.597 Mb/s · 17.13 %'),
        { en: '28 % short: the living-room laptop is walked down to MCS 0', zh: '少了 28 %：客厅笔记本被压到 MCS 0' }],
      [{ en: 'The living-room laptop leaves', zh: '客厅笔记本离线' }, N('43.621 Mb/s'), N('42.470 Mb/s · 0.28 %'),
        { en: 'nobody to collide with', zh: '没有人可撞' }],
    ] },
    { kind: 'table', heading: { en: 'Where the gap comes from', zh: '差距出在哪里' }, head: [
      { en: 'Mechanism', zh: '机制' }, { en: 'What the log shows', zh: '日志里看到的' }, { en: 'How big', zh: '有多大' },
    ], rows: [
      [{ en: 'Capture rescues the loser', zh: '捕获把输家救了回来' }, { en: '4,990 overlaps → 2,713 retries', zh: '4,990 次重叠 → 2,713 次重传' },
        { en: 'about 46 % of losers survive; the two differ by 34 dB', zh: '约 46 % 的输家活了下来；两台相差 34 dB' }],
      [{ en: 'The deaf late start', zh: '聋掉的迟到起跑' }, { en: '1,342 of 2,399 laptop-against-laptop collisions', zh: '2,399 次笔记本互撞中有 1,342 次' },
        N('10.46 % → 23.15 %')],
      [{ en: 'Frames grow under rate control', zh: '帧在速率控制下变长' }, N('148.1 vs 129.6 µs · 600.9 vs 524.0 µs'),
        { en: 'most of the 11.6 % shortfall', zh: '吞吐少掉的 11.6 % 的大部分' }],
      [{ en: 'Residual', zh: '残差' }, { en: 'nothing in the log names it', zh: '日志里没有东西指认它' },
        { en: 'a couple of points, reported not fitted', zh: '两个百分点左右，如实报出而不拟合掉' }],
    ] },
    { heading: { en: 'The level the two laptops hear each other at', zh: '两台笔记本互相听到的电平' }, text: {
      en: 'They reach each other at −72.64 dBm: above the −82 dBm a preamble needs, far below the −62 dBm energy alone must reach. Detect it and you freeze; miss it, and the channel reads idle.',
      zh: '它们到达对方处的电平是 −72.64 dBm：高于检出一个前导所需的 −82 dBm，又远低于仅凭能量判忙所需的 −62 dBm。抓到了前导就冻结；错过了，信道读出来就是空闲。',
    } },
    { kind: 'table', heading: { en: 'What each station waits after the same frame', zh: '同一帧之后，各自要等多久' }, head: [
      { en: 'The station', zh: '这台站点' }, { en: 'What it heard', zh: '它听到了什么' }, { en: 'What it waits', zh: '它要等的' },
    ], rows: [
      [{ en: 'A collider', zh: '碰撞的一方' }, { en: 'its answer never came', zh: '回答没有来' }, N('45 µs')],
      [{ en: 'The living-room laptop', zh: '客厅笔记本' }, { en: '21.35 dB, against the 44.99 dB the frame asks', zh: '21.35 dB，而这一帧要求 44.99 dB' }, { en: 'EIFS, 94 µs — 9,499 times', zh: 'EIFS，94 µs——共 9,499 次' }],
      [{ en: 'One that heard nothing', zh: '什么也没听见的' }, { en: 'no preamble at all', zh: '完全没有前导' }, N('DIFS, 34 µs')],
    ] },
    { kind: 'steps', heading: { en: 'How to mark a sheet', zh: '怎么批一张答题纸' }, items: [
      { en: 'Mark (a) first. Both arriving levels should sit within a decibel of −40.73 and −75.15 dBm, and each rung be justified by its requirement plus the margin. The first data frame of each laptop carries the rung.',
        zh: '先批（a）。两个到达电平都应落在 −40.73 与 −75.15 dBm 的一个分贝之内，而每个等级都要用“要求加余量”说清。等级就写在每台笔记本的第一个数据帧上。' },
      { en: 'Mark (b) on those same two frames: 129.6 and 524.0 µs on screen. A wrong answer here usually dropped the header and the check bytes, or rounded the symbol count down instead of up.',
        zh: '（b）就拿同两个帧来批：屏幕上是 129.6 与 524.0 µs。这里答错的人，通常是漏掉了帧头与校验字节，或者把符号数向下取整而不是向上。' },
      { en: 'Mark (c) by asking which estimator was used. An answer that calls the measured retry rate agreement with the predicted collision chance has not compared the same thing twice.',
        zh: '（c）先问用的是哪个估计量。把实测的重传率和预测的碰撞概率当成“对上了”的答案，根本没有把同一件事比两遍。' },
      { en: 'Mark (d) from the durations, not the turns: the two laptops send near enough the same number of frames and still take 21.2 % and 78.8 % of the air. A wrong answer splits the air evenly.',
        zh: '（d）看时长，不看轮次：两台笔记本发出的帧数差不多，占空口却是 21.2% 与 78.8%。把空口平均分的答案，就是错的。' },
      { en: 'Mark the gaps last. Two mechanisms, each named, sized in the model’s own units and pointing at a record: overlaps against retries for capture, the collision times for the deaf late start.',
        zh: '差距放到最后批。两个机制，都要点名、都要用模型自己的单位定量、且都要指得出记录：捕获看重叠数对重传数，“聋掉的迟到起跑”看碰撞发生的时刻。' },
      { en: 'Then look for the residual. A sheet that ends with two unexplained points, stated plainly, marks above one whose columns agree because a constant was tuned.',
        zh: '最后找残差。一张最后写着“还剩两个百分点没能解释”的答题纸，比一张靠调常数让两列重合的答题纸分数更高。' },
    ] },
    { kind: 'table', heading: { en: 'What a good answer contains', zh: '好答案长什么样' }, head: [
      { en: 'Part', zh: '部分' }, { en: 'A good answer', zh: '好答案' },
    ], rows: [
      [N('(a)'), { en: 'Both levels within a decibel, the wall counted once, the rung justified by requirement plus margin', zh: '两个电平误差都在一分贝内，墙只数一次，等级用“要求加余量”说清' }],
      [N('(b)'), { en: 'Symbols rounded up, header and check bytes included, the answer’s rate derived not assumed', zh: '符号数向上取整，算进头部与校验字节，回答的速率是推出来的而不是想当然的' }],
      [N('(c)'), { en: 'The collision chance quoted with no rate in it, the estimator named', zh: '给出碰撞概率时不带速率，并说清用的是哪个估计量' }],
      [N('(d)'), { en: 'Equal frames, unequal airtime, the split taken from the durations', zh: '帧数相同而空口时间不同，占比由帧时长算出' }],
      [{ en: 'The gaps', zh: '差距' }, { en: 'Two mechanisms named and sized in the model’s units, the residual reported', zh: '点名两个机制，各自用模型自己的单位定量，并报出残差' }],
    ] },
  ],
  deeper: [
    { heading: { en: 'Why the two errors nearly cancel', zh: '为什么两个误差差点抵消' }, text: {
      en: 'The retry rate looked close to the predicted collision chance for a reason that should worry you: two errors of opposite sign. The real overlap rate is more than twice the prediction, because of the deaf late start; capture then hides about 46 % of those overlaps from the retry counter. Multiply the two and you land near the model — with neither half of the model right.',
      zh: '重传率看上去与预测的碰撞概率很接近，而其中的原因应当令人不安：两个符号相反的误差。真实的重叠率是预测的两倍多，那是“聋掉的迟到起跑”造成的；捕获随后又把其中约 46 % 从重传计数器前面藏了起来。两者一乘，就落回到模型附近——可模型的两半，没有一半是对的。',
    } },
    { heading: { en: 'Why the moved variant agrees so well', zh: '为什么搬走之后的变体吻合得那么好' }, text: {
      en: 'Move the study laptop behind the same wall and the two frames become long and nearly equal. A station that finishes a 415 µs frame and waits out its timeout no longer finds the other one still going, so the deaf late start has almost nothing left to catch — and the measured overlap rate lands within a point of the model. The throughput still falls short, because rate control is untouched by any of this.',
      zh: '把书房笔记本挪到同一堵墙之后，两个帧都变得又长又几乎相等。一台发完 415 µs 的帧、又等完超时的站点，不再会发现对方仍在发，于是“聋掉的迟到起跑”几乎无从下手——实测的重叠率也就落在模型一个百分点之内。吞吐依旧偏低，因为速率控制完全不受这些影响。',
    } },
  ],
  sources: [
    { en: 'The two carrier-sense thresholds this lesson leans on — a detected preamble at −82 dBm and energy alone at −62 dBm — are this simulator’s CCA model, drawn from the sensitivity requirements of §17.3.10.6 of IEEE Std 802.11-2024 rather than lifted from them.',
      zh: '本课倚重的两条载波侦听门限——检出前导的 −82 dBm 与仅凭能量的 −62 dBm——是本仿真器的 CCA 模型，取材自 IEEE Std 802.11-2024 §17.3.10.6 的灵敏度要求，而非照抄。' },
    { en: 'EIFS after a failed reception, and the rule that a station may not treat such a medium as simply idle, are §10.3.2.3; the ACK timeout is §10.3.2.9.',
      zh: '接收失败之后的 EIFS，以及“不得把这样的介质径直当作空闲”这条规则，见 §10.3.2.3；ACK 超时见 §10.3.2.9。' },
    { en: 'Every count, ratio and timestamp above is this simulator’s, reproducible from the scene’s own seed: a ten-second run of the project flat and of its three variants. The capture rule and the rate-adaptation algorithm behind them are model choices, and the residual is what they do not explain.',
      zh: '上面每一个计数、比值和时刻都是本仿真器的取值，靠场景自己的种子即可复现：对项目那户人家及其三个变体各跑十秒。其背后的捕获规则与速率控制算法都是模型取值，而残差正是它们解释不掉的那一部分。' },
  ],
  scenario: () => projectFlat(),
  variants: projectVariants,
  jumps: projectJumps,
  observe: [
    { en: 'The first millisecond: both laptops start at once, the study laptop’s 129.6 µs block ends, and at 406.6 µs it starts again — inside the living-room laptop’s 524.0 µs frame, still running.', zh: '第一毫秒里：两台笔记本同时起跑，书房笔记本 129.6 µs 的色块结束，然后在 406.6 µs 又发了一次——落在客厅笔记本那个仍在进行的 524.0 µs 帧里。' },
    { en: 'Hover the living-room laptop’s waiting blocks just after a study-laptop frame: they read 94 µs, not 34. It locked onto a preamble it could not decode, so it must allow for an answer it cannot hear.', zh: '在书房笔记本发完一帧之后，悬停客厅笔记本的等待色块：上面写的是 94 µs，而不是 34。它锁上了一个解不出来的前导，只好为一个它听不见的回答留出时间。' },
    { en: 'Read the two green lanes side by side: comparable numbers of blocks, 9,719 against 9,123 delivered, but the living-room lane is filled about four times as long. Equal turns, unequal airtime.', zh: '把两条绿色泳道并排读：色块数量相当，成功交付 9,719 对 9,123，但客厅那条泳道被填满的时间大约是四倍。轮次相同、空口不同，一屏之内看尽。' },
  ],
  tryThis: [
    { en: 'Run the tablet variant and then the empty-flat one. The collision chance is almost exactly as predicted in both; the throughput is not. Write down which of your four predictions survives a change of scene.', zh: '先跑加平板的变体，再跑空房子的那个。两次的碰撞概率都几乎与预测分毫不差，吞吐却不是。写下你的四个预测里，哪些经得起换场景，哪些经不起。' },
    { en: 'Write the project up: four predictions, four readings, two mechanisms named and sized in the model’s own units, and the residual stated. A reader should be able to disagree with a specific line.', zh: '把项目写成一份报告：四个预测、四个读数、两个点了名并用模型自己单位定了量的机制，以及如实写出的残差。读它的人应当能针对某一行具体地反驳你。' },
  ],
  quiz: [
    {
      q: { en: 'You predicted a 10.46 % collision chance; the run retries 12.59 % of attempts. Why is declaring agreement a mistake?', zh: '你预测的碰撞概率是 10.46 %，实跑中 12.59 % 的尝试发生了重传。为什么此刻宣告一致是个错误？' },
      options: [
        { en: '12.59 % is outside the model’s tolerance', zh: '12.59 % 超出了模型应有的容差' },
        { en: 'The estimator measures something else: 23.15 % of attempts overlap, and capture saves 46 % of the losers', zh: '这个估计量测的是别的东西：实际有 23.15 % 的尝试重叠，而捕获救回了约 46 % 的输家' },
        { en: 'Ten seconds is too short a sample', zh: '十秒的样本太短' },
      ],
      answer: 1,
      explain: { en: 'A retry counts a lost frame, not an overlap, and with 34 dB between the laptops those are different events. Ten seconds is thousands of attempts, and the model has no tolerance band.', zh: '重传数的是丢失的帧，而不是重叠；两台笔记本之间差着 34 dB，这就是两件不同的事。十秒已经是数千次尝试，而模型本身也没有什么容差带。' },
    },
    {
      q: { en: 'The study laptop transmits again while the other’s frame is still on the air. Which rule allows that?', zh: '客厅笔记本的帧还在空中时，书房笔记本又发了一次。是哪条规则允许的？' },
      options: [
        { en: 'The NAV had expired, so the channel was free', zh: 'NAV 已经到期，所以信道在形式上是空闲的' },
        { en: 'Its preamble was missed while the radio was transmitting, so only energy is left — and −72.64 dBm is under −62 dBm', zh: '那个前导在本机发送期间到达而被错过，于是只剩能量可判——而 −72.64 dBm 低于 −62 dBm' },
        { en: 'A station may always start after its ACK timeout and a DIFS', zh: '站点在 ACK 超时加一个 DIFS 之后总是可以开始发送' },
      ],
      answer: 1,
      explain: { en: 'The −82 dBm threshold applies only to a preamble actually detected; everything else is energy, and energy must reach −62 dBm to hold CCA busy. Neither frame leaves a NAV the other can read.', zh: '−82 dBm 的门限只适用于电台确实检测到了的前导；其余一切只算能量，而能量必须达到 −62 dBm 才能让 CCA 置忙。两个帧都没有给对方留下可读的 NAV。' },
    },
  ],
}
