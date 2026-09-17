/**
 * Tier 1 · M2 · "Where the model and the simulator part company".
 *
 * The companion to bianchi.ts: the same fixed point, read against the same
 * runs, with every gap named, sized and attributed. Numbers are pinned by
 * tests/course/tier1-bianchi-vs-sim.test.ts.
 *
 * The busy-slot experiment quoted under "the slot clock" is a one-off probe,
 * not something the engine does: it patches WifiMac.prototype.onIfsEndAc to
 * decrement the backoff across each busy period (Bianchi's convention) and
 * re-measures n = 20. Probe script (session scratchpad, run with npx tsx):
 * <session scratchpad>/lesson-bianchi/probe3dec.mts (patch + re-measure).
 */
import { J, firstCollision, firstData, firstRetry, type Lesson } from '../lessonKit'
import { bianchiScenario, nLabel } from './bianchi'

export const bianchiVsSim: Lesson = {
  id: 'bianchi-vs-sim',
  module: 1,
  title: {
    en: 'Where the model and the simulator part company',
    zh: '模型与仿真器在哪里分道扬镳',
  },
  body: [
    { text: {
      en: 'The previous lesson ended with agreement inside 10% on p and 5% on throughput — and with a handful of gaps whose signs were systematic, not noise. This lesson is about the skill that matters more than the model: reading a disagreement between an analysis and a measurement without lying to yourself.',
      zh: '上一课以“p 偏差在 10% 以内、吞吐在 5% 以内”的一致性收尾——同时留下若干符号系统性、并非噪声的偏差。这一课讲的是比模型本身更重要的技能：在不自欺的前提下，读懂解析结果与测量结果之间的分歧。',
    } },
    { kind: 'steps', heading: { en: 'The order of questions', zh: '提问的顺序' }, items: [
      { en: 'Is the estimator measuring the model\'s quantity? p is per attempt, conditional on transmitting — not collisions per second, not lost MSDUs.', zh: '估计量测的是不是模型里的那个量？p 是“每次尝试”的概率、以发送为条件——不是每秒碰撞次数，也不是丢失的 MSDU 数。' },
      { en: 'Does the setup meet the assumptions? Saturation, fixed rate, no capture, everyone in range — each is a knob you can check, and most gaps die here.', zh: '实验设置满足假设了吗？饱和、固定速率、无捕获、彼此都在覆盖内——每一条都是可以核对的旋钮，多数偏差在这一步就查清了。' },
      { en: 'Which mechanism, and how big? Name it, size it in the units of the model (slots, microseconds, percent), and check the sign.', zh: '是哪个机制、有多大？把它点名，用模型自己的单位（时隙、微秒、百分点）定量，再核对符号。' },
      { en: 'What is left over? Say so. "Unexplained, about 4%" is a result; a fitted fudge factor is not.', zh: '还剩下多少解释不了？如实说出来。“约 4% 无法解释”是一个结果；而拟合出来的修正因子不是。' },
    ] },
    { heading: { en: '1. The assumption that breaks hardest: a fixed rate', zh: '一、最先崩掉的假设：固定速率' }, text: {
      en: 'This lesson\'s default scenario is the same five saturated stations, moved one metre from the AP at 15 dBm: a 54 Mb/s ceiling and 57.8 dB of SNR, a link with nothing wrong with it. The model predicts 29.52 Mb/s. The run delivers 5.53. Before blaming the MAC, look at the frames: of 6,248 data frames, 67.7% leave at 6 Mb/s and 1.1% at 54 Mb/s. The rate controller steps down after two consecutive failures and needs ten consecutive successes to climb, and with a quarter of attempts colliding it spends the run near the bottom of the ladder.',
      zh: '本课的默认场景还是那五台饱和终端，只是挪到离 AP 一米、以 15 dBm 发送：上限 54 Mb/s、SNR 57.8 dB，链路本身毫无问题。模型预测 29.52 Mb/s，实跑只有 5.53。在责怪 MAC 之前先看帧：6,248 个数据帧里，67.7% 以 6 Mb/s 发出，只有 1.1% 用上 54 Mb/s。速率控制器连续两次失败就降档，要连续十次成功才升档，而在四分之一尝试都碰撞的环境里，它整段仿真都贴着阶梯底部。',
    } },
    { text: {
      en: 'The MAC is innocent: p̂ is 26.17% close in against 25.84% on the arc, both within a point of the model\'s 27.22%. The entire shortfall is rate control mistaking collisions for a fading channel — the pathology that collision-aware rate adaptation was invented for (CARA, Kim et al., INFOCOM 2006; RRAA, Wong et al., MobiCom 2006). The lesson generalises: when a model and a simulator disagree by a factor of five, the cause is almost never the mechanism the model describes.',
      zh: 'MAC 是无辜的：近处 p̂ = 26.17%，圆弧上 25.84%，两者都与模型的 27.22% 相差不到一个百分点。全部缺口都来自速率控制把碰撞误判为信道衰落——正是“碰撞感知速率自适应”被发明出来要解决的病症（CARA，Kim 等，INFOCOM 2006；RRAA，Wong 等，MobiCom 2006）。这条经验可以推广：当模型与仿真差出五倍时，原因几乎从来不是模型所描述的那个机制。',
    } },
    { heading: { en: '2. A constant the model gets to choose: T_c', zh: '二、模型可以自己挑的常数：T_c' }, text: {
      en: 'Bianchi\'s basic-access collision costs a data frame plus DIFS, because his sender learns of the failure when the frame would have ended. This MAC waits out the 45 µs ACK timeout and starts the retry\'s DIFS there (§10.3.2.9; onRespTimeout in mac.ts), giving T_c = 2143 µs against T_s = 2158 µs. At 6 Mb/s a collision is therefore 15 µs *cheaper* than a success — 0.7% of a slot, worth 0.2% of throughput at n = 20, while taking the paper\'s own T_c (frame + DIFS, 2098 µs) instead would move the prediction by 0.6% the other way. Small, but it is the kind of constant that is worth deriving from the code you are checking rather than copying from a paper.',
      zh: 'Bianchi 的基本接入里，一次碰撞的代价是一个数据帧加 DIFS，因为他的发送方在帧本该结束时才知道失败。而本 MAC 要等满 45 µs 的 ACK 超时，并从那里开始计重传的 DIFS（§10.3.2.9；mac.ts 的 onRespTimeout），于是 T_c = 2143 µs，而 T_s = 2158 µs。所以在 6 Mb/s 上，一次碰撞比一次成功还便宜 15 µs——占一个时隙的 0.7%，在 n = 20 时值 0.2% 的吞吐；而若改用论文自己的 T_c（帧 + DIFS，2098 µs），预测又会往反方向挪 0.6%。数值很小，但这类常数值得从你正在核对的代码里推出来，而不是从论文里抄过来。',
    } },
    { heading: { en: '3. The slot clock: freeze or decrement?', zh: '三、时隙时钟：冻结还是递减？' }, text: {
      en: 'In Bianchi\'s chain a busy period is itself one slot: every deferring station\'s counter ticks down across it. The standard freezes the counter instead and resumes at the same value (§10.23.2.4), so stations reach the next idle slot one step higher than the chain assumes, and they transmit slightly later and slightly less often than τ says. Patch the engine to decrement across each busy period and n = 20\'s measured p rises from 45.83% towards 47.9%, roughly half the gap to the predicted 49.59%. That patch is a one-off experiment, not a mode of the simulator — the engine follows the standard.',
      zh: '在 Bianchi 的链里，一个忙周期本身就算一个时隙：所有正在延迟的终端的计数器都会在它上面减一。而标准是冻结计数器、之后从同一数值继续（§10.23.2.4），于是终端进入下一个空闲时隙时比链假设的高一档，发送时刻略晚、频率也略低于 τ 所言。把引擎改成在每个忙周期上递减，n = 20 实测的 p 就会从 45.83% 升到 47.9% 左右，约为它与预测值 49.59% 之间偏差的一半。那次改动只是一次性实验，并不是仿真器的某种模式——引擎遵循的是标准。',
    } },
    { heading: { en: '4. One event, three restart times', zh: '四、一次事件，三种重启时刻' }, text: {
      en: 'The model restarts everybody together. After a collision on the arc, the two senders wait their 45 µs ACK timeout, a third station that locked onto one of the overlapping preambles and failed to decode it waits EIFS = 94 µs (§10.3.2.3.7), and one that locked onto neither waits only DIFS = 34 µs. The n = 5 arc run logs 1,029 EIFS deferrals. Each is a station kept out of contention for 60 µs longer than its neighbours — a desynchronisation the chain has no state for, and one more reason the simulator collides a little less than predicted.',
      zh: '模型让所有人同时重启。而在圆弧场景里，一次碰撞之后：两个发送方各等 45 µs 的 ACK 超时；锁上了重叠前导之一却解不出来的第三方要等 EIFS = 94 µs（§10.3.2.3.7）；两个都没锁上的只等 DIFS = 34 µs。n = 5 的圆弧仿真记录了 1,029 次 EIFS 延迟。每一次都意味着某台终端比邻居多被挡在竞争之外 60 µs——这种去同步在链里没有对应的状态，也是仿真器碰撞略少于预测的又一个原因。',
    } },
    { heading: { en: '5. Where decoupling is worst: small n', zh: '五、解耦最站不住的地方：n 很小' }, text: {
      en: 'n = 2 is the only row whose sign flips: measured 11.20% against a predicted 10.46%. With a single opponent there is nothing to average over — after one station wins, its partner\'s residual counter is anything but a fresh uniform draw, and the independence assumption has no crowd to hide behind. Accuracy improves as n grows, which is exactly backwards from the intuition that small networks are easy.',
      zh: 'n = 2 是唯一符号反转的一行：实测 11.20%，预测 10.46%。只有一个对手时无从平均——某台终端赢下一轮后，对方剩余的计数器怎么看都不是一次全新的均匀抽签，而独立性假设也没有“人群”可以藏身。精度随 n 增大而变好，这与“小网络更简单”的直觉恰好相反。',
    } },
    { heading: { en: '6. What the model cannot say at all', zh: '六、模型根本无法回答的事' }, text: {
      en: 'p is one number per network. In the n = 20 arc run the per-station collision rates run from 42.9% to 52.1%, and nothing is wrong: that is the spread of a finite sample of one shared lottery. But fairness, delay tails and starvation are outside the model\'s vocabulary, and a model silently answering a question you did not ask it is the most expensive mistake in this lesson.',
      zh: 'p 是一个网络一个数。在 n = 20 的圆弧仿真里，各终端的碰撞率从 42.9% 铺到 52.1%，而这没有任何问题：它只是同一场共享抽奖在有限样本上的离散。但公平性、时延长尾和饿死现象根本不在模型的词汇表里，而一个模型悄悄回答了你没有问它的问题，是本课中代价最高的错误。',
    } },
    { text: {
      en: 'Add it up: rate control explains a factor of five when it is allowed to act, the slot-clock convention about half of the remaining few points at n ≥ 5, EIFS and T_c a fraction of a point each, and small-n decoupling the sign flip at n = 2. What is left — a couple of points — stays unexplained, and that is an honest place to stop. The model earns its keep anyway: no fitted parameters, two equations, and predictions good to a few percent across a tenfold change in network size.',
      zh: '把账算齐：速率控制在它被允许动作时能解释五倍的差距；时隙时钟的约定能解释 n ≥ 5 时剩余几个百分点中的大约一半；EIFS 与 T_c 各值零点几个百分点；而 n = 2 的符号反转来自小 n 下的解耦失真。剩下的——两个百分点左右——仍然无法解释，而就此打住是诚实的做法。模型依然物有所值：没有拟合参数、两个方程，在网络规模变化十倍的范围内把结果预测到几个百分点以内。',
    } },
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
    { en: 'In the default (close-in) run the green blocks change length constantly: 248 µs at 54 Mb/s, 2,064 µs at 6 Mb/s. On the arc variant every block is the same length — that is the fixed-rate assumption, switched on and off.', zh: '在默认（贴近 AP）的仿真里，绿色色块的长度一直在变：54 Mb/s 时 248 µs，6 Mb/s 时 2,064 µs。而在圆弧变体里每个色块都一样长——这就是固定速率假设的开与关。' },
    { en: 'Close in, the AP sometimes locks onto one of two overlapping preambles and logs a failed reception; on the arc, where every station arrives at the same −81.7 dBm, it never does — RX_MISS every time. Capture is a distance effect.', zh: '贴近 AP 时，AP 有时会锁上两个重叠前导中的一个并记录一次接收失败；而在圆弧上，每台终端都以同样的 −81.7 dBm 到达，这种情况从不发生——每次都是 RX_MISS。捕获效应是距离带来的。' },
    { en: 'After a collision, step forward through the defer blocks: the colliders are still inside their 45 µs ACK timeout while some neighbours are already in EIFS and others in DIFS. Three clocks, one event.', zh: '碰撞之后，逐步向前翻等待色块：碰撞双方还在各自 45 µs 的 ACK 超时里，而有的邻居已经进入 EIFS、有的只在 DIFS。一次事件，三个时钟。' },
  ],
  tryThis: [
    { en: 'Run both variants for ten seconds and put four numbers side by side: p̂ 26.17% close in against 25.84% on the arc (the MAC behaves identically), throughput 5.534 against 4.717 Mb/s, and the model\'s 29.52 Mb/s at 54 Mb/s against 4.679 at 6. Attributing the missing 24 Mb/s to rate control rather than to contention is the whole exercise.', zh: '把两个变体各跑十秒，把四个数并排放：p̂ 近处 26.17%、圆弧 25.84%（MAC 的行为完全一致），吞吐 5.534 对 4.717 Mb/s，模型在 54 Mb/s 下给 29.52 Mb/s、在 6 Mb/s 下给 4.679。把缺掉的 24 Mb/s 归因于速率控制而不是竞争，就是这道练习的全部。' },
    { en: 'Test the model at its corner. Give all five arc stations the "CW = 0" tampered driver (cwMin = cwMax = 0: W = 1, m = 0, so τ = 1, p = 1, S = 0) and the run delivers exactly that — 23,335 attempts, 23,330 collided, no ACK at all, 3,330 MSDUs dropped at the retry limit. Then leave the cheat on one station only: it takes 4,634 of the 4,639 attempts, the four obedient stations get five frames between them in ten seconds, and the channel carries 5.557 Mb/s — the single-station limit 12,000 bits / T_s.', zh: '在模型的极端角落考它。给圆弧上五台终端全挂上“CW = 0”的篡改驱动（cwMin = cwMax = 0：W = 1、m = 0，于是 τ = 1、p = 1、S = 0），仿真给出的正是如此——23,335 次尝试、23,330 次碰撞、一个 ACK 也没有、3,330 个 MSDU 因重传上限被丢弃。然后只保留一台作弊：它拿走 4,639 次尝试中的 4,634 次，四台守规矩的终端十秒里一共只发出五帧，而信道仍跑出 5.557 Mb/s——正是单终端极限 12,000 比特 / T_s。' },
  ],
  quiz: [
    {
      q: { en: 'Close in, the simulator delivers 5.53 Mb/s where the model says 29.52. Which measurement settles the cause fastest?', zh: '贴近 AP 时仿真交付 5.53 Mb/s，而模型说 29.52。哪一项测量最快能定位原因？' },
      options: [
        { en: 'The number of MSDUs dropped at the retry limit', zh: '因重传上限被丢弃的 MSDU 数' },
        { en: 'The distribution of data rates over the frames actually sent', zh: '实际发出的帧在各数据速率上的分布' },
        { en: 'The queue depth at each station', zh: '各终端的队列深度' },
      ],
      answer: 1,
      explain: { en: 'p̂ already matches the model, so contention is not the suspect. The rate mix (67.7% at 6 Mb/s, 1.1% at 54) names the mechanism in one histogram; drops and queue depth are both negligible here.', zh: 'p̂ 已经与模型吻合，所以竞争不是嫌疑人。速率分布（67.7% 在 6 Mb/s、1.1% 在 54 Mb/s）用一张直方图就点出了机制；而丢弃数和队列深度在这里都可以忽略。' },
    },
    {
      q: { en: 'On the arc at n ≥ 5 the simulator collides less than predicted. Which difference points that way?', zh: '在圆弧场景、n ≥ 5 时，仿真器的碰撞比预测少。哪一项差异指向这个方向？' },
      options: [
        { en: 'The retry limit of 7 — it makes stations restart at CW = 15', zh: '7 次的重传上限——它让终端从 CW = 15 重新开始' },
        { en: 'The standard freezes the backoff during a busy period where the chain decrements it, so counters run one step behind', zh: '标准在忙周期里冻结退避，而链会递减，于是计数器落后一步' },
        { en: 'The 4 dB preamble-detection rule, which turns simultaneous starts into clean collisions', zh: '4 dB 的前导检测门限，它把同时起始变成干净的碰撞' },
      ],
      answer: 1,
      explain: { en: 'The retry limit pushes p up, not down (48.09% → 49.59% at n = 20), and the preamble rule is what makes the model\'s no-capture assumption true. Freezing rather than decrementing delays every deferring station by a slot, and forcing the engine to decrement recovers about half the gap.', zh: '重传上限是把 p 往上推而不是往下压（n = 20 时 48.09% → 49.59%），而前导检测门限恰恰让模型的“无捕获”假设成立。冻结而非递减会让每台延迟中的终端晚一个时隙，把引擎改成递减能补回大约一半的偏差。' },
    },
    {
      q: { en: 'The remaining few percent stay unexplained. What is the professional move?', zh: '还剩几个百分点解释不了。专业的做法是什么？' },
      options: [
        { en: 'Tune W or T_c until the curves overlap', zh: '调 W 或 T_c，直到两条曲线重合' },
        { en: 'Report the residual, with the mechanisms already accounted for and their sizes', zh: '如实报告残差，并列出已经解释掉的机制及其量级' },
        { en: 'Declare the simulator wrong, since the model is published and peer-reviewed', zh: '宣布仿真器有错，因为模型是发表过、经过同行评审的' },
      ],
      answer: 1,
      explain: { en: 'A fitted constant destroys the only thing the model was good for — predicting from the standard\'s parameters alone. A named residual is reproducible; a fudge factor is not, and neither is an appeal to authority.', zh: '拟合出来的常数会毁掉模型唯一的价值——仅凭标准里的参数做预测。写明的残差是可复现的；修正因子不是，诉诸权威也不是。' },
    },
  ],
}
