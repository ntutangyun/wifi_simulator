/**
 * Wi-Fi Tier 1 · M2 · Channel access · The prediction against the run.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the
 * companion to bianchi.ts, cut from 1472 words to fit one lesson. The picture
 * is now the skill — put the two side by side, name what differs, size it,
 * and say what is left — while the derivations, the slot-clock probe, the
 * per-station spread and the single-cheat corner live in `deeper`.
 *
 * The busy-slot experiment quoted under "the slot clock" is a one-off probe,
 * not something the engine does: it patches WifiMac.prototype.onIfsEndAc to
 * decrement the backoff across each busy period (Bianchi's convention) and
 * re-measures n = 20. Probe script (session scratchpad, run with npx tsx):
 * <session scratchpad>/lesson-bianchi/probe3dec.mts (patch + re-measure).
 *
 * Numbers are pinned by tests/course/bianchi-vs-sim.test.ts. The scenarios are
 * unchanged, so the recorded timeline hashes stay identical.
 */
import { J, N, firstCollision, firstData, firstRetry, type Lesson } from '../lessonKit'
import { bianchiScenario, nLabel } from './bianchi'

export const bianchiVsSim: Lesson = {
  id: 'bianchi-vs-sim',
  module: 1,
  title: {
    en: 'The prediction against the run',
    zh: '预测对上实跑',
  },
  why: {
    en: 'A prediction is only useful once you know where it stops being true. Put the paper answer next to a measurement and they will never match exactly — and what you do next is the difference between an engineer and someone with a spreadsheet. This lesson reads one disagreement honestly: what to check first, what to blame, how big each cause is, and what to say about the part you cannot explain.',
    zh: '一个预测，只有在你知道它从哪里开始失效之后才真正有用。把纸上的答案和实测放在一起，它们永远不会严丝合缝——而接下来你怎么做，正是工程师与“会用表格的人”之间的区别。这一课我们诚实地读一次分歧：先查什么、该怪谁、每个原因有多大，以及对那部分解释不了的东西该怎么说。',
  },
  outcomes: [
    { en: 'check an estimate against the quantity a model actually defines', zh: '核对你的估计量，是不是模型真正定义的那个量' },
    { en: 'tell an assumption that was broken from a mechanism that was missing', zh: '分清“假设被破坏了”和“机制没被建模”这两件事' },
    { en: 'report a residual instead of tuning a constant until the curves meet', zh: '把残差如实报出来，而不是调一个常数直到两条曲线重合' },
  ],
  needs: ['bianchi'],
  terms: [
    { term: 'rate control', plain: {
      en: 'the sender’s automatic choice of how fast to send, made from whether recent frames got through',
      zh: '发送方自动决定“发多快”：依据是最近几帧有没有送到',
    } },
    { term: 'capture', plain: {
      en: 'a receiver locking onto the stronger of two overlapping frames and reading it anyway',
      zh: '两帧重叠时，接收端锁住其中更强的那一帧，照样把它读了出来',
    } },
    { term: 'residual', plain: {
      en: 'the part of a disagreement still unexplained once every cause you found has been counted',
      zh: '把你找到的每个原因都算进去之后，分歧里仍然解释不了的那一部分',
    } },
  ],
  picture: [
    { heading: { en: 'Two answers, side by side', zh: '两个答案，并排放' }, text: {
      en: 'On the arc — every station the same distance from the access point, every frame the same length — the prediction and the run agree closely. That is the good case, and it is good on purpose: the scene was built so that each assumption the paper makes is actually true. Move one thing, and the agreement can vanish.',
      zh: '在圆弧上——每台终端到 AP 的距离相同，每一帧的长度也相同——预测与实跑吻合得相当好。这是好的那一种情况，而且是刻意布置出来的：整个场景就是为了让论文的每一条假设真的成立。只要挪动其中一件事，这份吻合就可能消失。',
    } },
    { heading: { en: 'A sender that changes its mind', zh: '一个会改主意的发送方' }, text: {
      en: 'Move the same five stations close in, where the link can carry frames nine times faster, and the run delivers a fifth of what the paper says. The rules did not break. Rate control did: a sender that loses frames slows down, and it cannot tell a collision from a weak signal. So it slows down into a crowd, making every frame longer and every clash more likely.',
      zh: '把同样这五台终端挪到近处——链路在那里能把帧发快九倍——实跑却只交付了纸上说法的五分之一。规则没坏，坏的是速率控制：丢帧的发送方会降速，而它分不清“碰撞”和“信号弱”。于是它在人多的时候越降越慢，让每一帧都更长、每一次相撞都更容易发生。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Watch the blocks change length', zh: '看那些色块的长度在变' }, text: {
      en: 'Load the simulation and jump to the first collision. The coloured blocks keep changing length as the senders step up and down. Then load the arc variant: every block is the same length again. That is the fixed-rate assumption, switched off and on.',
      zh: '载入仿真，跳到第一次碰撞。发送方在阶梯上上下下，彩色色块的长度也一直跟着变。再载入圆弧变体：每个色块又都一样长了。这就是固定速率假设的关与开。',
    } },
    { heading: { en: 'Near and far: capture', zh: '远近之别：捕获' }, text: {
      en: 'Distance changes the collisions themselves. Close in, two overlapping frames rarely arrive at the same strength, and the access point sometimes locks onto the louder one and reads it: capture. On the arc nobody is louder, so nothing is ever locked onto and an overlap really does destroy every frame in it — which is exactly what the paper assumes. Real rooms sit somewhere between.',
      zh: '距离本身会改变碰撞的样子。在近处，两个重叠的帧很少以相同的强度到达，AP 有时会锁住更响的那一个并把它读出来：这就是捕获。而在圆弧上没有谁更响，于是什么都锁不住，一次重叠真的会把其中每一帧都毁掉——这恰恰是论文的假设。真实的房间落在两者之间。',
    } },
    { heading: { en: 'One event, three clocks', zh: '一次事件，三只钟' }, text: {
      en: 'The paper restarts everybody at the same instant. Real stations do not. The two that collided wait out their own deadline. A neighbour that locked onto one of the overlapping frames and failed to read it owes the long penalty wait, EIFS. A neighbour that locked onto neither owes only the short one, DIFS. Three different restart times, from one event — and the chain has no state for that.',
      zh: '论文让所有人在同一瞬间重启，真实的终端不会。碰撞的那两台各自等满自己的期限。锁上了重叠帧之一却没能读出来的邻居，欠的是那段长长的惩罚等待 EIFS。两个都没锁上的邻居，只欠短的那个 DIFS。一次事件，三种重启时刻——而那条链里根本没有描述这件事的状态。',
    } },
    { heading: { en: 'What to do with what is left', zh: '剩下的那部分怎么办' }, text: {
      en: 'Name each cause, size it in the model’s own units, check its sign — then say out loud how much is still unaccounted for. That leftover is the residual, and reporting it is a result. Tuning a constant until the curves meet is not: it destroys the one thing the prediction was good for.',
      zh: '把每个原因点名，用模型自己的单位给它定量，核对符号——然后说出还有多少没算清。剩下的那一块就是残差，如实报出它本身就是一个结果。而把某个常数一路调到曲线重合，不是：那会毁掉这个预测唯一的价值。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'On the arc: prediction against ten seconds of run', zh: '圆弧场景：预测对上十秒实跑' }, head: [
      N('n'), { en: 'Collides, predicted', zh: '碰撞，预测' }, { en: 'Collides, measured', zh: '碰撞，实测' },
      { en: 'Throughput, predicted', zh: '吞吐，预测' }, { en: 'Throughput, measured', zh: '吞吐，实测' },
    ], rows: [
      [N('2'), N('10.46 %'), N('11.20 %'), N('5.169'), N('5.136 Mb/s')],
      [N('5'), N('27.22 %'), N('25.84 %'), N('4.679'), N('4.717 Mb/s')],
      [N('10'), N('38.92 %'), N('35.08 %'), N('4.275'), N('4.421 Mb/s')],
      [N('20'), N('49.59 %'), N('45.83 %'), N('3.857'), N('4.027 Mb/s')],
    ] },
    { heading: { en: 'Close, but wrong the same way each time', zh: '很接近，但每次都错向同一边' }, text: {
      en: 'Every collision figure lands within 10 % of the prediction and every throughput within 5 %, with no fitted parameter. But from five stations upward the run always collides less than predicted, and only the two-station row flips sign — systematic, therefore explainable.',
      zh: '每一个碰撞数都落在预测的 10% 以内，每一个吞吐都在 5% 以内，而且全程没有任何拟合参数。但从五台终端往上，实跑的碰撞总是少于预测，只有两台终端那一行符号反了过来。既然是系统性的，就是可以解释的。',
    } },
    { kind: 'table', heading: { en: 'The same five stations, moved close in', zh: '同样五台终端，挪到近处' }, head: [
      { en: 'Measured close in', zh: '近处实测' }, { en: 'On the arc', zh: '圆弧上' }, { en: 'Predicted', zh: '预测' },
    ], rows: [
      [{ en: 'Collides: 26.17 %', zh: '碰撞：26.17%' }, N('25.84 %'), N('27.22 %')],
      [{ en: 'Throughput: 5.53 Mb/s', zh: '吞吐：5.53 Mb/s' }, N('4.717 Mb/s'), N('29.52 Mb/s')],
      [{ en: 'Frames at the slowest rate: 67.7 %', zh: '以最慢速率发出的帧：67.7%' }, N('100 %'), { en: 'none, by assumption', zh: '按假设为零' }],
    ] },
    { heading: { en: 'Reading that table', zh: '这张表怎么读' }, text: {
      en: 'The middle column is the alibi: close in the stations collide just as the paper says, so contention is not the suspect — what collapsed is the rate. Of 6248 frames sent close in, only 1.1 % used the fast rate the link could carry.',
      zh: '中间那一列就是不在场证明：近处的终端碰撞得和论文说的一样多，竞争不是嫌疑人——崩掉的是速率。近处发出的 6248 帧里，只有 1.1% 用上了链路扛得住的快速率。',
    } },
    { kind: 'list', heading: { en: 'The smaller differences, sized', zh: '较小的差异，各值多少' }, items: [
      { en: 'The slot clock. The chain lets a waiting counter tick down across a busy period; the standard freezes it. Force the engine to tick and the twenty-station figure climbs from 45.83 % towards 47.9 % — half the gap to the predicted 49.59 %.', zh: '时隙时钟。链会让等待中的计数器在忙周期上继续减一，而标准是把它冻住。把引擎改成继续减一，二十台终端的实测值就从 45.83% 升到 47.9% 左右——大约是它与预测值 49.59% 之间差距的一半。' },
      { en: 'Restart times. The five-station arc run logs 1029 long penalty waits, each keeping one neighbour out of the contention 60 µs longer than the others. The chain has no state for that.', zh: '重启时刻。五台终端的圆弧仿真记录了 1029 次长惩罚等待，每一次都让某个邻居比其他人多被挡在竞争之外 60 µs。而那条链里没有描述“人群失去同步”的状态。' },
      { en: 'The cost of a pile-up. A collision here ends 15 µs sooner than a success, 0.7 % of one exchange and worth 0.2 % of throughput at twenty stations. The paper’s own figure would move the prediction 0.6 % the other way.', zh: '撞车的代价。在这里，一次碰撞比一次成功早结束 15 µs，约占一次交互的 0.7%，在二十台终端时值 0.2% 的吞吐。改用论文自己的取值，预测反而会往另一边挪 0.6%。' },
    ] },
    { heading: { en: 'The residual', zh: '残差' }, text: {
      en: 'Add the named causes up and about two points of collision rate at the larger crowds are still unaccounted for. Say so. The prediction earns its keep anyway: two equations, no fitted parameter, throughput right to a few percent across a tenfold change in crowd size.',
      zh: '把点过名的原因加总，人多时仍有大约两个百分点的碰撞率没有着落。就这么说出来。这个预测依然物有所值：两个方程、零个拟合参数，而在人数变化十倍的范围里，吞吐都预测到了几个百分点以内。',
    } },
  ],
  deeper: [
    { heading: { en: 'Why small crowds are the hard case', zh: '为什么人少反而是难的情形' }, text: {
      en: 'Two stations is the row whose sign flips: measured 11.20 % against a predicted 10.46 %. The chain treats the others as coins tossed independently in every slot, and with a single opponent there is nothing to average over — after one station wins, what is left on its partner’s counter is anything but a fresh uniform draw. Accuracy improves as the crowd grows, which is exactly backwards from the intuition that small networks are easy.',
      zh: '两台终端就是那个符号反转的行：实测 11.20%，预测 10.46%。链把其余终端当成每个时隙独立抛掷的硬币，而只有一个对手时根本无从平均——某台终端赢下一轮之后，对方计数器上剩下的数怎么看都不是一次全新的均匀抽签。精度随人群变大而变好，这与“小网络更简单”的直觉恰好相反。',
    } },
    { heading: { en: 'What the model cannot be asked', zh: '有些问题不能问这个模型' }, text: {
      en: 'The collision probability is one number for a whole network. In the twenty-station arc run the per-station rates spread from 42.9 % to 52.1 %, and nothing is wrong: that is the spread of a finite sample of one shared lottery. But fairness, delay tails and starvation are outside this model’s vocabulary entirely, and a model quietly answering a question you did not ask it is the most expensive mistake in this lesson.',
      zh: '碰撞概率是整个网络一个数。在二十台终端的圆弧仿真里，各终端自己的碰撞率从 42.9% 铺到 52.1%，而这没有任何问题：那只是同一场共享抽奖在有限样本上的离散。但公平性、时延长尾与饿死现象，根本不在这个模型的词汇表里；而一个模型悄悄回答了你没问它的问题，是本课中代价最高的错误。',
    } },
    { heading: { en: 'The pathology has a literature', zh: '这个病症是有文献的' }, text: {
      en: 'A rate controller that reads collisions as fading is exactly what collision-aware rate adaptation was invented to fix: CARA (Kim et al., INFOCOM 2006) probes with a request-to-send frame before stepping down, and RRAA (Wong et al., MobiCom 2006) keeps a short-window loss estimate instead of counting consecutive failures. Neither is modelled here; the point of the close-in run is to show why they exist.',
      zh: '把碰撞读成衰落的速率控制器，正是“碰撞感知速率自适应”被发明出来要治的东西：CARA（Kim 等，INFOCOM 2006）在降档前先用一个请求发送帧探一探，RRAA（Wong 等，MobiCom 2006）用短窗口的丢失率估计代替“连续失败计数”。这里两者都没有建模；近处那次仿真的意义，就是让你看见它们为什么存在。',
    } },
    { heading: { en: 'Testing the model at its corner', zh: '在模型的极端角落考它' }, text: {
      en: 'Give all five arc stations a tampered driver with no window at all and the equations say every station transmits in every slot, every attempt collides, throughput is zero. The run delivers exactly that: 23,335 attempts, 23,330 of them collided, not one answer, 3,330 frames given up. Leave the cheat on one station only and it takes 4,634 of the 4,639 attempts, the four obedient stations get five frames away between them in ten seconds, and the channel still carries 5.557 Mb/s — the one-station ceiling, a payload divided by the cost of one clean exchange.',
      zh: '给圆弧上五台终端全挂上“根本没有窗口”的篡改驱动，方程会说：每台终端在每个时隙都发送，每次尝试都碰撞，吞吐为零。实跑给出的正是如此：23,335 次尝试，其中 23,330 次碰撞，一个回答也没有，3,330 帧被放弃。只给一台挂上作弊，它就拿走 4,639 次尝试中的 4,634 次，四台守规矩的终端十秒里一共只发出五帧，而信道仍跑出 5.557 Mb/s——正是单终端的天花板：一个净荷除以一次干净交互的代价。',
    } },
  ],
  sources: [
    { en: 'The acknowledgement deadline and the retry’s wait are §10.3.2.9 of IEEE Std 802.11-2024 (onRespTimeout in mac.ts); the counter freezes during a busy period by §10.23.2.4; the long penalty wait after a failed reception is EIFS, §10.3.2.3.7, 94 µs here against a DIFS of 34 µs.',
      zh: '确认期限与重传前的等待见 IEEE Std 802.11-2024 §10.3.2.9（mac.ts 的 onRespTimeout）；忙周期内计数器冻结见 §10.23.2.4；接收失败后的长惩罚等待是 EIFS，见 §10.3.2.3.7，这里是 94 µs，而 DIFS 是 34 µs。' },
    { en: 'The slot-clock figure of about 47.9 % comes from a one-off probe that patches the MAC to decrement the backoff across each busy period. It is not a mode of this simulator and is deliberately not pinned by a test; the engine follows the standard.',
      zh: '时隙时钟那个约 47.9% 的数字，来自一次一次性探针：它给 MAC 打补丁，让退避在每个忙周期上递减。这不是本仿真器的某种模式，也有意不被测试钉住；引擎遵循的是标准。' },
    { en: 'The close-in scene at 15 dBm, the arc at −20 dBm, seed 7, the ten-second sample and the preamble-detection margin that decides capture are this simulator’s model choices. The collision-aware rate schemes named above are CARA (Kim et al., INFOCOM 2006) and RRAA (Wong et al., MobiCom 2006).',
      zh: '15 dBm 的近处场景、−20 dBm 的圆弧、种子 7、十秒采样，以及决定捕获与否的前导检测余量，都是本仿真器的模型取值。上面提到的碰撞感知速率方案是 CARA（Kim 等，INFOCOM 2006）与 RRAA（Wong 等，MobiCom 2006）。' },
  ],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: [
    { label: { en: 'n = 5 on the arc (rate pinned at 6 Mb/s)', zh: 'n = 5 在圆弧上（速率钉在 6 Mb/s）' }, scenario: () => bianchiScenario(5) },
    { label: nLabel(20), scenario: () => bianchiScenario(20) },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first collision', '第一次碰撞', firstCollision),
    J('first retry', '第一次重传', firstRetry),
    J('first CW doubling', '第一次 CW 翻倍', (r) => r.type === 'CW_CHANGE' && r.cw > 15),
  ],
  observe: [
    { en: 'In the close-in run the green blocks keep changing length: 248 µs at the fast rate, 2064 µs at the slow one. On the arc variant every block is the same length.', zh: '在近处那次仿真里，绿色色块的长度一直在变：快速率下 248 µs，慢速率下 2064 µs。而在圆弧变体里，每个色块都一样长。' },
    { en: 'Close in, the access point sometimes locks onto one of two overlapping frames and logs a failed reception. On the arc, where every station arrives at the same strength, it never does. Capture is a distance effect.', zh: '在近处，AP 有时会锁住两个重叠帧中的一个，并记下一次接收失败。而在圆弧上，每台终端到达的强度都一样，这种事从不发生。捕获是距离带来的效应。' },
    { en: 'After a collision, step forward through the waiting blocks: the two that collided are still inside their own deadline while one neighbour is in EIFS and another in DIFS. Three clocks, one event.', zh: '碰撞之后，逐步向前翻那些等待色块：碰撞的两台还在各自的期限里，一个邻居已经进入 EIFS，另一个只在 DIFS。一次事件，三只钟。' },
  ],
  tryThis: [
    { en: 'Run both variants ten seconds and put four numbers side by side: 26.17 % close in against 25.84 % on the arc, then 5.534 against 4.717 Mb/s. Blaming rate control rather than contention is the whole exercise.', zh: '把两个变体各跑十秒，把四个数并排放：近处 26.17%、圆弧 25.84%，然后是 5.534 对 4.717 Mb/s。把缺掉的那部分吞吐归因于速率控制而不是竞争，就是这道练习的全部。' },
    { en: 'Test the prediction at its corner. Give all five arc stations the tampered driver with no window: the run collides 23,330 times out of 23,335 attempts, delivers nothing, gives up 3,330 frames — exactly what the equations say.', zh: '在预测的极端角落考它。给圆弧上五台终端都挂上“没有窗口”的篡改驱动：实跑在 23,335 次尝试里碰撞 23,330 次，什么也没送到，放弃 3,330 帧——与方程说的分毫不差。' },
  ],
  quiz: [
    {
      q: { en: 'Close in the run delivers a fifth of what the prediction says. Which measurement settles the cause fastest?', zh: '近处实跑只交付了预测的约五分之一。哪一项测量最快能定位原因？' },
      options: [
        { en: 'How many frames were given up', zh: '有多少帧被放弃了' },
        { en: 'The spread of data rates over the frames actually sent', zh: '实际发出的帧在各数据速率上的分布' },
        { en: 'How deep each station’s queue got', zh: '各终端的队列排到多深' },
      ],
      answer: 1,
      explain: { en: 'The measured collision rate already matches the prediction, so contention is not the suspect. The rate mix names the mechanism at a glance.', zh: '实测的碰撞率已经与预测吻合，所以竞争不是嫌疑人。速率分布用一张直方图就点出了机制。' },
    },
    {
      q: { en: 'On the arc with five or more stations the run collides less than predicted. Which difference explains it?', zh: '圆弧上五台及以上时，实跑的碰撞比预测少。哪一项差异指向这个方向？' },
      options: [
        { en: 'Giving a frame up after seven attempts', zh: '一帧七次之后就被放弃' },
        { en: 'The standard freezes a waiting counter during a busy period where the chain ticks it down', zh: '标准在忙周期里把等待中的计数器冻住，而链会让它继续减一' },
        { en: 'The preamble rule that turns simultaneous starts into clean collisions', zh: '把同时起始变成干净碰撞的那条前导规则' },
      ],
      answer: 1,
      explain: { en: 'The retry limit pushes the collision rate up, not down, and the preamble rule is what makes no capture true. Freezing delays every waiting station by a slot.', zh: '重传上限是把碰撞率往上推而不是往下压，而前导规则恰恰让“无捕获”假设成立。冻结则让每台等待中的终端晚一个时隙。' },
    },
    {
      q: { en: 'A few percent stay unexplained. What is the professional move?', zh: '还剩几个百分点解释不了。专业的做法是什么？' },
      options: [
        { en: 'Tune a constant until the two curves overlap', zh: '调一个常数，直到两条曲线重合' },
        { en: 'Report the residual, with the causes already accounted for and their sizes', zh: '如实报告残差，并列出已经解释掉的原因及其量级' },
        { en: 'Declare the simulator wrong, since the model is published', zh: '宣布仿真器有错，因为模型是发表过的' },
      ],
      answer: 1,
      explain: { en: 'A fitted constant destroys the only thing the prediction was good for. A named residual is reproducible; a fudge factor is not.', zh: '拟合出来的常数会毁掉这个预测唯一的价值。写明的残差是可复现的；修正因子不是，诉诸权威也不是。' },
    },
  ],
}
