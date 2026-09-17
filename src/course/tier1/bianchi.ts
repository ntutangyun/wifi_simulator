/**
 * Tier 1 · M2 · "Saturation throughput from first principles — the Bianchi model".
 *
 * The analytic numbers quoted in the prose come from src/course/tier1/
 * bianchiModel.ts and are recomputed, together with every measured number,
 * by tests/course/tier1-bianchi.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, N, firstBackoffDraw, firstCollision, firstData, firstRetry, node, oneRoom, sc, type L10n, type Lesson } from '../lessonKit'

/**
 * n saturated legacy stations on a 3 m arc around the AP, every one of them
 * heard at exactly the same level, and all whispering at −20 dBm so the AP
 * receives them at −81.7 dBm: 12.3 dB of SNR, which only 6 Mb/s clears. That
 * is what pins the rate for the whole run — see the lesson text: with any
 * headroom at all the rate controller reads collisions as a fading channel and
 * walks the rate down, which is not the fixed-rate world the model describes.
 *
 * Equal receive levels also mean no capture: two frames that start in the same
 * slot reach the AP at ~0 dB SINR and both fail the 4 dB preamble-detection
 * rule, so a collision destroys every frame in it, exactly as the model assumes.
 */
function bianchiScenario(n: number, opts: { near?: boolean } = {}): Scenario {
  const nodes = [node('ap', 'AP', 'ap', 2, 4, 'nonht', 'idle', {})]
  for (let i = 0; i < n; i++) {
    const deg = opts.near ? (360 * i) / n : -25 + (50 * i) / (n - 1)
    const a = (deg * Math.PI) / 180
    const r = opts.near ? 1 : 3
    const s = node(
      `sta-${i + 1}`, `STA-${i + 1}`, 'sta',
      +(2 + r * Math.cos(a)).toFixed(3), +(4 + r * Math.sin(a)).toFixed(3),
      'nonht', 'saturated', {},
    )
    s.txPowerDbm = opts.near ? 15 : -20
    nodes.push(s)
  }
  // The model knows no ageing rule: a 10-minute MSDU lifetime keeps every
  // queued frame alive, so every station stays saturated for the whole run.
  return sc(oneRoom(), nodes, { seed: 7, queue: { limit: 500, lifetimeMs: 600_000 } })
}

const nLabel = (n: number): L10n => ({ en: `n = ${n} stations`, zh: `n = ${n} 台终端` })

export const bianchi: Lesson = {
  id: 'bianchi',
  module: 1,
  minutes: 45,
  title: {
    en: 'Saturation throughput from first principles — the Bianchi model',
    zh: '从第一性原理求饱和吞吐——Bianchi 模型',
  },
  body: [
    { text: {
      en: 'Everything so far has been observed: you watched backoff counters, collisions, retries and queues on the timeline. This lesson does the opposite. Before running anything, we compute what n saturated stations sharing one DCF channel must deliver — collision probability and throughput, from the access rules alone — and then check the simulator against the arithmetic. The tool is the standard reference for it: G. Bianchi, "Performance Analysis of the IEEE 802.11 Distributed Coordination Function", IEEE JSAC 18(3):535–547, 2000, the most cited analysis in the field.',
      zh: '到目前为止的一切都是“看”出来的：你在时间轴上观察退避计数、碰撞、重传和队列。这一课反过来做。在跑任何仿真之前，我们先算出 n 台饱和终端共享一条 DCF 信道时必然得到的结果——碰撞概率和吞吐，全部只从接入规则推出——然后拿仿真器去对账。用的工具是这个领域的标准参考：G. Bianchi，《Performance Analysis of the IEEE 802.11 Distributed Coordination Function》，IEEE JSAC 18(3):535–547，2000，该领域被引用最多的分析。',
    } },
    { heading: { en: 'The model: two unknowns and one fixed point', zh: '模型：两个未知数、一个不动点' }, text: {
      en: 'Assume n stations that always have a frame queued (saturation), an ideal channel (a frame is lost only when another frame overlaps it), and — the one bold step — that each attempt of each station collides with a constant, independent probability p, whatever the station\'s backoff stage and whatever happened before. This is the decoupling approximation. It turns the whole BSS into two scalars: p, the conditional collision probability, and τ, the probability that a given station transmits in a given backoff slot.',
      zh: '假设有 n 台终端永远有帧排队（饱和）、信道是理想的（一帧只会因为与另一帧重叠而丢失），再加上关键的一步大胆假设：每台终端的每次尝试都以一个恒定且相互独立的概率 p 发生碰撞，与它处在第几个退避阶段、之前发生过什么都无关。这就是解耦近似。它把整个 BSS 压缩成两个标量：条件碰撞概率 p，以及某台终端在某个退避时隙里发送的概率 τ。',
    } },
    { kind: 'formula', text: {
      en: 'τ = 2(1 − 2p) / [ (1 − 2p)(W + 1) + pW(1 − (2p)^m) ]        p = 1 − (1 − τ)^(n−1)',
      zh: 'τ = 2(1 − 2p) / [ (1 − 2p)(W + 1) + pW(1 − (2p)^m) ]        p = 1 − (1 − τ)^(n−1)',
    }, note: {
      en: 'The first line is Bianchi\'s Markov chain solved for τ: a station in stage i draws uniformly from [0, 2^i·W − 1], and the chain\'s stationary distribution reduces to this. The second is the definition of p: my attempt collides exactly when at least one of the other n − 1 stations transmits in the same slot. Substituting one into the other gives a single equation in one unknown.',
      zh: '第一行是 Bianchi 的马尔可夫链对 τ 的解：处于第 i 阶段的终端从 [0, 2^i·W − 1] 均匀抽签，链的平稳分布化简后就是这个式子。第二行是 p 的定义：我这次尝试发生碰撞，当且仅当其余 n − 1 台终端中至少有一台在同一时隙发送。把两式互相代入，就得到一个只含一个未知数的方程。',
    } },
    { text: {
      en: 'For the engine\'s DCF the two constants are fixed by the standard: aCWmin = 15 and aCWmax = 1023 (IEEE 802.11-2024 §17.4.4), so W = CWmin + 1 = 16 and m = log2((CWmax + 1)/(CWmin + 1)) = 6 — six doublings, 15 → 31 → 63 → 127 → 255 → 511 → 1023. τ(p) falls with p and p(τ) rises with τ, so the fixed point is unique and plain bisection finds it (src/course/tier1/bianchiModel.ts). Note that (1 − (2p)^m)/(1 − 2p) is just Σ_{k<m} (2p)^k, which is how the solver evaluates it: no 0/0 at p = ½.',
      zh: '对本引擎的 DCF 而言，这两个常数由标准定死：aCWmin = 15、aCWmax = 1023（IEEE 802.11-2024 §17.4.4），于是 W = CWmin + 1 = 16，m = log2((CWmax + 1)/(CWmin + 1)) = 6——六次翻倍：15 → 31 → 63 → 127 → 255 → 511 → 1023。τ(p) 随 p 递减、p(τ) 随 τ 递增，所以不动点唯一，用最朴素的二分法就能求出（src/course/tier1/bianchiModel.ts）。注意 (1 − (2p)^m)/(1 − 2p) 不过是 Σ_{k<m} (2p)^k，求解器就是这么算的：p = ½ 处不会出现 0/0。',
    } },
    { heading: { en: 'From τ to throughput: pricing a generic slot', zh: '从 τ 到吞吐：给“通用时隙”定价' }, text: {
      en: 'Now look at the channel as a sequence of "generic slots", each either empty, a success or a collision. With P_tr = 1 − (1 − τ)^n (someone transmits) and P_s = nτ(1 − τ)^(n−1) / P_tr (exactly one does, given someone did), the throughput is payload delivered per unit of expected slot length:',
      zh: '现在把信道看成一串“通用时隙”，每个时隙要么空闲、要么是一次成功、要么是一次碰撞。记 P_tr = 1 − (1 − τ)^n（有人发送）、P_s = nτ(1 − τ)^(n−1) / P_tr（在有人发送的前提下恰好只有一人发送），吞吐就是每单位期望时隙长度所送达的净荷：',
    } },
    { kind: 'formula', text: {
      en: 'S = P_s·P_tr·E[payload] / [ (1 − P_tr)σ + P_tr·P_s·T_s + P_tr(1 − P_s)·T_c ]',
      zh: 'S = P_s·P_tr·E[净荷] / [ (1 − P_tr)σ + P_tr·P_s·T_s + P_tr(1 − P_s)·T_c ]',
    } },
    { text: {
      en: 'σ, T_s and T_c are not free parameters — they are this engine\'s constants. An idle slot is σ = 9 µs (aSlotTime, §17.4.4). A 1500-byte MSDU carries a 24-byte MAC header and a 4-byte FCS, so 1528 octets go on the air; at 6 Mb/s that PPDU lasts 2,064 µs (Eq. 17-29, 511 OFDM symbols plus the 20 µs preamble and SIGNAL). The ACK is 14 octets at the control-response rate (§10.6), here 6 Mb/s, 44 µs. So:',
      zh: 'σ、T_s、T_c 不是可以随手填的参数——它们就是本引擎的常数。空闲时隙 σ = 9 µs（aSlotTime，§17.4.4）。一个 1500 字节的 MSDU 带 24 字节 MAC 头和 4 字节 FCS，上空口的是 1528 字节；在 6 Mb/s 上这个 PPDU 长 2,064 µs（式 17-29：511 个 OFDM 符号，加上 20 µs 的前导与 SIGNAL 字段）。ACK 是 14 字节，按控制响应速率发送（§10.6），这里是 6 Mb/s，44 µs。于是：',
    } },
    { kind: 'formula', text: {
      en: 'T_s = 2064 + SIFS 16 + ACK 44 + DIFS 34 = 2158 µs        T_c = 2064 + ACKTimeout 45 + DIFS 34 = 2143 µs',
      zh: 'T_s = 2064 + SIFS 16 + ACK 44 + DIFS 34 = 2158 µs        T_c = 2064 + ACK 超时 45 + DIFS 34 = 2143 µs',
    }, note: {
      en: 'T_c is the engine\'s rule, not the paper\'s: a sender that gets no ACK learns nothing until its 45 µs timeout (SIFS + slot + aRxPHYStartDelay, §10.3.2.9) expires, and only then does the retry\'s DIFS start counting — see onRespTimeout in mac.ts, which moves the "last busy" mark to the timeout instant. At 6 Mb/s a collision is therefore 15 µs *cheaper* than a success, because a 45 µs timeout is shorter than SIFS + a 44 µs ACK. At 54 Mb/s, where the data frame is 248 µs and the ACK 28 µs at 24 Mb/s, the two are 326 µs and 327 µs.',
      zh: 'T_c 用的是本引擎的规则，而不是原论文的：拿不到 ACK 的发送方在 45 µs 超时（SIFS + 时隙 + aRxPHYStartDelay，§10.3.2.9）之前什么也不知道，重传的 DIFS 要等超时结束后才开始计——见 mac.ts 的 onRespTimeout，它把“最后一次忙”的时刻推到超时那一刻。所以在 6 Mb/s 上，一次碰撞反而比一次成功便宜 15 µs：45 µs 的超时比 SIFS 加 44 µs 的 ACK 更短。在 54 Mb/s 上，数据帧 248 µs、ACK 以 24 Mb/s 发送需 28 µs，两者分别是 326 µs 和 327 µs。',
    } },
    { heading: { en: 'Solve it', zh: '把它解出来' }, text: {
      en: 'Four networks, W = 16, m = 6, 1500-byte payloads (12,000 bits each). S is quoted twice: at 54 Mb/s, the rate a station beside the AP would use, and at 6 Mb/s, the rate this lesson\'s scenario runs at.',
      zh: '四种规模，W = 16、m = 6、净荷 1500 字节（每帧 12,000 比特）。S 给两列：一列是贴着 AP 的终端会用的 54 Mb/s，另一列是本课场景实际运行的 6 Mb/s。',
    } },
    { kind: 'table', head: [N('n'), N('τ'), N('p'), { en: 'S @ 54 Mb/s', zh: 'S @ 54 Mb/s' }, { en: 'S @ 6 Mb/s', zh: 'S @ 6 Mb/s' }], rows: [
      [N('2'), N('0.1046'), N('10.46 %'), N('31.28 Mb/s'), N('5.169 Mb/s')],
      [N('5'), N('0.0763'), N('27.22 %'), N('29.52 Mb/s'), N('4.679 Mb/s')],
      [N('10'), N('0.0533'), N('38.92 %'), N('27.36 Mb/s'), N('4.275 Mb/s')],
      [N('20'), N('0.0354'), N('49.59 %'), N('24.91 Mb/s'), N('3.857 Mb/s')],
    ] },
    { text: {
      en: 'Read the table before reading on. Two things should be uncomfortable. First, a 54 Mb/s PHY delivers 31 Mb/s to a single pair and 25 Mb/s to twenty stations — the MAC keeps roughly half the nominal rate at best, and the loss to contention between 2 and 20 stations is only 20%. Second, at 6 Mb/s almost nothing is lost: 5.17 → 3.86 Mb/s, because the overhead that contention adds (slots, timeouts) is tiny next to a 2 ms frame. Contention costs what it costs in *microseconds*; whether that matters depends entirely on how long a frame is.',
      zh: '先把这张表读懂再往下看。有两点应该让你不太舒服。第一，54 Mb/s 的 PHY 给一对收发只交付 31 Mb/s，给二十台终端交付 25 Mb/s——MAC 最好也就留下名义速率的一半左右，而从 2 台到 20 台，竞争造成的额外损失只有 20%。第二，在 6 Mb/s 上几乎没什么损失：5.17 → 3.86 Mb/s，因为竞争带来的开销（时隙、超时）在 2 ms 的帧面前微不足道。竞争的代价是以微秒计的；这代价要不要紧，完全取决于一帧有多长。',
    } },
    { heading: { en: 'p is a property of the window, not of the traffic', zh: 'p 是窗口的性质，不是业务的性质' }, text: {
      en: 'Notice what p does not depend on: the payload size, the data rate, the airtime of a frame. The fixed point only knows n, W and m. That is the rate-adaptation lesson\'s measured claim arriving as a theorem — a longer frame does not give anyone else\'s backoff counter more time to reach zero, because counters do not tick while the medium is busy (§10.23.2.4). Contention is settled in slots, and slots only pass when the channel is idle.',
      zh: '注意 p 不依赖什么：净荷大小、数据速率、一帧占用的空口时间，统统与它无关。不动点只认识 n、W、m 三个量。这正是“速率自适应”那一课用测量得出的那个结论，在这里以定理的形式出现——更长的帧不会给别人的退避计数器多出时间走到零，因为介质忙时计数器根本不走（§10.23.2.4）。竞争是在时隙里决出胜负的，而时隙只在信道空闲时流逝。',
    } },
    { heading: { en: 'What the model assumes that this simulator does not', zh: '模型假设了什么，而仿真器并不如此' }, kind: 'list', items: [
      { en: 'Infinite retries. Bianchi\'s chain retries a frame forever; the MAC here gives up after dot11ShortRetryLimit = 7 attempts (802.11-2020 removed the long/short split). With stages 0…6 that is exactly one attempt per backoff stage, which is the finite-retry chain of H. Wu et al., INFOCOM 2002 — the solver takes an `attempts` option for it. The correction is small but real: at n = 20, p goes 48.09% → 49.59% and S 3.920 → 3.857 Mb/s, because a station that gives up restarts at CW = 15 instead of staying at 1023. Every number quoted here uses the finite-retry chain.', zh: '无限重传。Bianchi 的链会把一帧永远重传下去；这里的 MAC 在 dot11ShortRetryLimit = 7 次尝试后放弃（802.11-2020 取消了长短帧两套限制）。阶段 0…6 恰好每个退避阶段一次尝试，这正是 H. Wu 等人（INFOCOM 2002）的有限重传链——求解器用 `attempts` 选项支持它。修正不大但真实存在：n = 20 时 p 从 48.09% 变为 49.59%，S 从 3.920 降到 3.857 Mb/s，因为放弃的终端会从 CW = 15 重新开始，而不是继续停在 1023。本课引用的每个数都用有限重传链算出。' },
      { en: 'An ideal channel. The model loses a frame only to collision. This engine decodes deterministically from SINR, so with every station 12.3 dB above the noise floor and no interferer, a frame either collides or arrives: there is no residual PER. That is a convenience of the current engine (a seeded PER draw arrives with the PHY tier), and it happens to be exactly what the model wants.', zh: '理想信道。模型里帧只会因碰撞而丢失。本引擎按 SINR 做确定性判决，所以在每台终端都高出底噪 12.3 dB 且无干扰源时，一帧要么碰撞、要么送达：不存在残余误包率。这是当前引擎的一种便利（带随机抽样的 PER 要到 PHY 那一层才引入），而它恰好就是模型想要的。' },
      { en: 'No capture. Two overlapping frames destroy each other. In this scenario every station reaches the AP at −81.7 dBm, so simultaneous starts arrive at ≈ 0 dB SINR and fail the receiver\'s 4 dB preamble-detection rule: no RX_START, no lock, nothing decoded — a textbook collision. Move one station closer and capture would resurrect the stronger frame, and the model would start to overstate the damage.', zh: '没有捕获效应。两帧重叠就同归于尽。在本场景里每台终端到达 AP 的功率都是 −81.7 dBm，所以同时起始的帧彼此 SINR ≈ 0 dB，连接收机 4 dB 的前导检测门限都过不去：没有 RX_START、没有锁定、什么也解不出来——教科书式的碰撞。把某台终端挪近一点，捕获效应就会救活较强的那一帧，而模型就会开始高估损失。' },
      { en: 'One slot clock for everybody. In Bianchi\'s chain a busy period is itself one slot, and every deferring station\'s counter ticks down across it. In the standard the counter freezes instead and resumes at the same value, and stations do not even re-enter contention together: after a collision the two senders wait out a 45 µs ACK timeout, a third station that managed to lock onto one of the two colliding preambles waits EIFS = 94 µs (§10.3.2.3.7), and one that locked onto neither waits only DIFS = 34 µs. The n = 5 run below contains 1,029 EIFS deferrals that the model has no place for.', zh: '大家共用一个时隙时钟。在 Bianchi 的链里，一个忙周期本身算作一个时隙，所有正在延迟的终端的计数器都会在它上面减一。而标准里计数器是冻结的，之后从同一数值继续；而且各终端甚至不会同时重新加入竞争：碰撞之后，两个发送方要等满 45 µs 的 ACK 超时；碰巧锁上了其中一个前导的第三方要等 EIFS = 94 µs（§10.3.2.3.7）；两个前导都没锁上的只等 DIFS = 34 µs。下面 n = 5 的那次仿真里有 1,029 次 EIFS 延迟，模型里根本没有它的位置。' },
      { en: 'A fixed rate. The model has one rate and one frame length. A real driver does not: after two consecutive failed attempts this simulator\'s rate controller steps the MCS down (the rate-adaptation lesson), and a collision looks exactly like a bad channel to it. That is why the stations in this scenario whisper — see below.', zh: '固定速率。模型只有一种速率、一种帧长。真实驱动并非如此：连续两次尝试失败后，本仿真器的速率控制器就会降一档 MCS（“速率自适应”那一课），而一次碰撞在它看来和信道变差一模一样。这就是本场景里终端都在“低声细语”的原因——见下文。' },
    ] },
    { heading: { en: 'The scenario, and why the stations whisper', zh: '场景，以及终端为什么要低声细语' }, text: {
      en: 'n legacy (non-HT, no EDCA, no aggregation) stations stand on a 3 m arc around the AP, all saturated, RTS threshold 3000 octets so nothing is protected. They transmit at −20 dBm, which puts every one of them at the AP at −81.7 dBm: 12.3 dB above the 20 MHz noise floor of −94.0 dBm, enough for 6 Mb/s and 0.7 dB short of the 13 dB that 9 Mb/s needs (10 dB required SINR plus the 3 dB link margin). The rate is therefore pinned by physics, and the rate controller — which cannot tell a collision from fading — has nowhere to fall.',
      zh: 'n 台传统终端（非 HT、无 EDCA、无聚合）站在以 AP 为圆心、半径 3 m 的圆弧上，全部饱和，RTS 门限 3000 字节，所以没有任何保护。它们以 −20 dBm 发送，使得每一台在 AP 处的接收电平都是 −81.7 dBm：比 20 MHz 的 −94.0 dBm 底噪高 12.3 dB，刚好够 6 Mb/s，而离 9 Mb/s 所需的 13 dB（10 dB 解调门限加 3 dB 链路余量）还差 0.7 dB。于是速率被物理条件钉死，而分不清碰撞与衰落的速率控制器也就无处可降。',
    } },
    { text: {
      en: 'Switch to the "n = 5, close in" variant to see why this matters. The same five stations, one metre from the AP at 15 dBm, have a 54 Mb/s ceiling and 57.8 dB of SNR — a link with no channel problem whatsoever. The model says 29.52 Mb/s. The simulator delivers 5.53 Mb/s. The reason is in the rate mix: of its 6,248 data frames, 67.7% go out at 6 Mb/s and only 1.1% at 54 Mb/s, because pairs of collisions keep pushing the controller down the ladder and ten consecutive successes are hard to come by when a quarter of the attempts collide. Collision probability meanwhile barely notices the change of rate: 26.17% close in, 25.84% on the arc. This is the classic pathology that collision-aware rate adaptation exists to fix (CARA, Kim et al., INFOCOM 2006; RRAA, Wong et al., MobiCom 2006) — and it is also a warning about analytic models: Bianchi\'s assumption of a fixed rate is not a detail, it is a precondition.',
      zh: '切到“n = 5，贴近 AP”这个变体就知道为什么要这么安排。同样五台终端，离 AP 一米、15 dBm 发送，上限是 54 Mb/s、SNR 有 57.8 dB——链路本身毫无问题。模型给出 29.52 Mb/s，仿真器只交付 5.53 Mb/s。原因在速率分布里：它发出的 6,248 个数据帧中，67.7% 是以 6 Mb/s 发出的，只有 1.1% 用上了 54 Mb/s，因为成对的碰撞不断把控制器往下推，而在四分之一尝试都碰撞的环境里，连续十次成功太难攒了。与此同时碰撞概率几乎不受速率影响：近处 26.17%，圆弧上 25.84%。这正是“碰撞感知速率自适应”要解决的经典病症（CARA，Kim 等，INFOCOM 2006；RRAA，Wong 等，MobiCom 2006）——同时它也是对解析模型的一句警告：Bianchi 所假设的固定速率不是细节，而是前提。',
    } },
    { heading: { en: 'Measuring p and S in the simulator', zh: '在仿真器里测 p 和 S' }, text: {
      en: 'Definitions first, because a sloppy estimator is the usual reason a model "disagrees". An attempt is one data-frame TX_START. An attempt collided if its ACK never came — the sender\'s ACK timeout fires and the MAC emits a RETRY record (with no RTS/CTS, no aggregation and no EDCA there is no other path to a RETRY here, and an ideal channel leaves collision as the only cause). The estimate is p̂ = Σ RETRY / Σ attempts, pooled over stations; throughput is 12,000 bits per acknowledged MSDU, i.e. per ACK the AP sends, over the run. Ten seconds of simulated time is enough for stability: seeds 7, 8 and 12345 give p̂ = 25.84%, 25.53%, 25.71% and 4.717, 4.734, 4.727 Mb/s in the n = 5 network. A given seed replays bit for bit.',
      zh: '先把定义说清楚，因为模型“对不上”十有八九是估计量没定义好。一次尝试 = 一条数据帧的 TX_START。若这次尝试的 ACK 始终没来——发送方的 ACK 超时触发、MAC 记录一条 RETRY——就算它碰撞了（这里没有 RTS/CTS、没有聚合、没有 EDCA，不存在别的路径产生 RETRY；而理想信道让碰撞成为唯一原因）。估计量就是 p̂ = Σ RETRY / Σ 尝试，在各终端上合并统计；吞吐按每个被确认的 MSDU 12,000 比特计，也就是按 AP 发出的每个 ACK 计，除以仿真时长。十秒仿真时间足以稳定：在 n = 5 的网络里，种子 7、8、12345 分别给出 p̂ = 25.84%、25.53%、25.71%，吞吐 4.717、4.734、4.727 Mb/s。同一个种子逐比特可复现。',
    } },
    { kind: 'table', heading: { en: 'Model vs simulator, 10 s per run, seed 7', zh: '模型对仿真：每次运行 10 秒，种子 7' }, head: [
      N('n'), { en: 'p model', zh: 'p 模型' }, { en: 'p̂ simulator', zh: 'p̂ 仿真' }, N('Δ'), { en: 'S model', zh: 'S 模型' }, { en: 'S simulator', zh: 'S 仿真' }, N('Δ'),
    ], rows: [
      [N('2'), N('10.46 %'), N('11.20 %'), N('+7.1 %'), N('5.169'), N('5.136 Mb/s'), N('−0.6 %')],
      [N('5'), N('27.22 %'), N('25.84 %'), N('−5.1 %'), N('4.679'), N('4.717 Mb/s'), N('+0.8 %')],
      [N('10'), N('38.92 %'), N('35.08 %'), N('−9.9 %'), N('4.275'), N('4.421 Mb/s'), N('+3.4 %')],
      [N('20'), N('49.59 %'), N('45.83 %'), N('−7.6 %'), N('3.857'), N('4.027 Mb/s'), N('+4.4 %')],
    ] },
    { text: {
      en: 'Every collision probability is within 10% of the prediction and every throughput within 5%, with no fitted parameter anywhere: W, m, σ, T_s and T_c all came from the standard and from the engine\'s own constants. For an approximation this crude — a whole BSS reduced to two numbers — that is a remarkable result, and it is why the model is still used to size networks and to sanity-check simulators (including this one).',
      zh: '每个碰撞概率都落在预测值的 10% 以内，每个吞吐都在 5% 以内，而且全程没有任何拟合参数：W、m、σ、T_s、T_c 全部来自标准和引擎自身的常数。对于一个如此粗糙的近似——把整个 BSS 压缩成两个数——这个结果相当了不起，这也是该模型至今仍被用来估算网络规模、用来给仿真器（包括本仿真器）做合理性检查的原因。',
    } },
    { heading: { en: 'Reading the gaps', zh: '读懂那些偏差' }, kind: 'list', items: [
      { en: 'The signs are systematic, not noise: at n ≥ 5 the simulator collides less often than predicted, and delivers correspondingly more. Fewer collisions and higher throughput are the same fact seen twice — the model\'s error budget is consistent.', zh: '偏差的符号是系统性的，不是噪声：n ≥ 5 时仿真器的碰撞比预测少，交付也相应地多。碰撞更少和吞吐更高是同一件事的两面——模型的误差预算是自洽的。' },
      { en: 'The decoupling approximation is the prime suspect. Real attempts are not independent: the two stations that just collided are precisely the two that are out of contention for the next 45 µs and then draw from a doubled window, while everyone else keeps their (already partly spent) counters. Bianchi\'s p, being the same for every station in every stage, cannot represent that negative correlation.', zh: '首要嫌疑是解耦近似。真实的尝试并不独立：刚刚碰撞的那两台，恰恰是接下来 45 µs 内退出竞争、随后从翻倍窗口重新抽签的那两台，而其他人手里还攥着（已经走掉一部分的）计数器。Bianchi 的 p 对所有终端、所有阶段都取同一个值，无法表达这种负相关。' },
      { en: 'The slot-clock convention adds to it in the same direction. Because the standard freezes rather than decrements during a busy period, stations arrive at the next idle slot with counters one step higher than the chain assumes; forcing the engine to decrement across each busy period (a probe, not a supported mode) moves n = 20 from 45.8% up towards 47.9%, i.e. about half the remaining gap.', zh: '时隙时钟的约定与之同向叠加。因为标准在忙周期里是冻结而不是递减，终端进入下一个空闲时隙时，计数器比链所假设的高一档；强行让引擎在每个忙周期上递减（只是一次探针实验，并非受支持的模式）会把 n = 20 的 45.8% 抬到 47.9% 左右，也就是补上剩余偏差的一半左右。' },
      { en: 'n = 2 is the exception and flips sign: with only one other station, "constant and independent" is at its worst — the partner\'s residual counter after a win is anything but uniform — and the model under-predicts p by 7%. Accuracy of the decoupling approximation improves as n grows; it is the small-n corner that hurts.', zh: 'n = 2 是例外，而且符号相反：只有一个对手时，“恒定且独立”这一假设最站不住脚——对方赢下一轮后剩余的计数器怎么看都不是均匀分布的——模型把 p 低估了 7%。解耦近似的精度随 n 增大而变好；难受的恰恰是 n 很小的角落。' },
      { en: 'Fairness is not in the model at all: p is one number, but in the n = 20 run the per-station collision rates spread from 42.9% to 52.1%. Nothing is wrong — it is the spread of a finite sample of a shared lottery — but any claim about "the" collision probability of a station is a claim about an average.', zh: '模型里压根没有公平性这回事：p 只有一个数，而在 n = 20 的仿真里，各终端的碰撞率从 42.9% 铺到 52.1%。这没有任何问题——它只是共享抽奖在有限样本上的离散——但凡是谈“某台终端的”碰撞概率，谈的都是一个平均值。' },
    ] },
    { text: {
      en: 'One last sanity check you can run yourself in a minute: the model has a degenerate corner at W = 1, m = 0. A station whose driver pins CW = 0 (cwMin = cwMax = 0, so nothing to draw and nothing to double) transmits in every slot it reaches, so τ = 1, and with n such stations p = 1 and S = 0. The "tampered driver → CW = 0" cheat does exactly that, and the simulator agrees to four decimal places (see Try this). Models that survive their own corner cases are the ones worth trusting.',
      zh: '最后一个你一分钟就能自己跑的合理性检查：模型在 W = 1、m = 0 处有一个退化的角落。驱动把 CW 钉死为 0 的终端（cwMin = cwMax = 0，既无可抽，也无可翻倍）在它能到达的每个时隙都发送，于是 τ = 1；n 台这样的终端一起，p = 1、S = 0。“篡改驱动 → CW = 0”这种作弊正是如此，而仿真器与之吻合到小数点后四位（见“动手试试”）。能经受住自己极端情形考验的模型，才值得信任。',
    } },
  ],
  scenario: () => bianchiScenario(5),
  variants: [
    { label: nLabel(2), scenario: () => bianchiScenario(2) },
    { label: nLabel(10), scenario: () => bianchiScenario(10) },
    { label: nLabel(20), scenario: () => bianchiScenario(20) },
    {
      label: { en: 'n = 5, close in, 54 Mb/s ceiling', zh: 'n = 5，贴近 AP，上限 54 Mb/s' },
      scenario: () => bianchiScenario(5, { near: true }),
    },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first collision', '第一次碰撞', firstCollision),
    J('first retry', '第一次重传', firstRetry),
    J('first backoff draw', '第一次退避抽签', firstBackoffDraw),
  ],
  observe: [
    { en: 'The run opens with the worst collision it will ever have: every station finds the medium idle "since forever", skips backoff entirely (§10.3.4.2) and transmits at t = 0, so the first COLLISION record names all five (all twenty in the n = 20 variant) and resolves only when those 2,064 µs frames end at t = 2.064 ms.', zh: '这段仿真以它一生中最糟的一次碰撞开场：每台终端都发现介质“自古以来”就是空闲的，于是完全跳过退避（§10.3.4.2）在 t = 0 直接发送，所以第一条 COLLISION 记录点名了全部五台（n = 20 变体里是全部二十台），并且要等到那些 2,064 µs 的帧在 t = 2.064 ms 结束才算了结。' },
    { en: 'Every data frame is identical: 1,528 octets at 6 Mb/s, 2,064 µs on the air, answered 16 µs later by a 44 µs ACK. That constancy is what makes T_s a single number instead of a distribution — check a few frames in the inspector and you will not find a second value.', zh: '每个数据帧都长得一模一样：1,528 字节、6 Mb/s、空口 2,064 µs，16 µs 后由一个 44 µs 的 ACK 应答。正是这种一致性让 T_s 成为一个数而不是一个分布——在检视器里翻几帧，你找不到第二个值。' },
    { en: 'At the AP, a collision leaves no RX_START at all: both preambles arrive at ~0 dB SINR and are recorded as RX_MISS (reason preambleSinr). Compare with the "close in" variant, where unequal distances sometimes let one preamble win and the AP shows a locked-but-failed reception instead.', zh: '在 AP 侧，一次碰撞连 RX_START 都不会留下：两个前导都以 ≈ 0 dB 的 SINR 到达，被记为 RX_MISS（原因 preambleSinr）。和“贴近 AP”的变体对比一下：那里距离各不相同，有时某个前导会胜出，AP 就会显示一次“锁定但解码失败”的接收。' },
    { en: 'Watch the third stations after a collision, not the colliders: some defer EIFS (94 µs) because they locked onto one of the overlapping preambles and failed to decode it, the rest only DIFS (34 µs). The stations that collided are meanwhile still waiting out their 45 µs ACK timeout. Three different restart times for one event — the model assumes one.', zh: '碰撞之后要盯着第三方终端，而不是碰撞双方：有的要延迟一个 EIFS（94 µs），因为它锁上了重叠前导中的一个却解不出来；其余的只等一个 DIFS（34 µs）。与此同时，碰撞的双方还在等各自 45 µs 的 ACK 超时。一次事件、三种重启时刻——而模型假设只有一种。' },
  ],
  tryThis: [
    { en: 'Predict before you switch. Take the model table, pick the n = 10 row (p = 38.92%, S = 4.275 Mb/s), then load the n = 10 variant and let it run ten seconds: 5,678 attempts, 1,992 of them collided (35.08%), 3,684 ACKs — 4.421 Mb/s. Do the same for n = 2 (11.20%, 5.136 Mb/s) and n = 20 (45.83%, 4.027 Mb/s) and plot the two curves against each other; the prediction is never off by more than 10% on p or 5% on throughput.', zh: '先预测，再切换。拿出模型那张表，挑 n = 10 那一行（p = 38.92%、S = 4.275 Mb/s），然后载入 n = 10 的变体跑满十秒：5,678 次尝试，其中 1,992 次碰撞（35.08%），3,684 个 ACK——4.421 Mb/s。对 n = 2（11.20%、5.136 Mb/s）和 n = 20（45.83%、4.027 Mb/s）如法炮制，再把两条曲线画在一起；预测在 p 上从不偏离超过 10%，在吞吐上不超过 5%。' },
    { en: 'Break the model on purpose. In the editor give all five stations the "CW = 0" tampered driver (cwMin = cwMax = 0: W = 1, m = 0): the model says τ = 1, p = 1, S = 0, and the run delivers exactly that — 23,335 attempts, 23,330 of them collided (99.98%), zero ACKs, 3,330 MSDUs discarded at the retry limit. Now undo it for four of them and leave one cheat: the cheater takes 4,634 of the 4,639 attempts in the run, the network still carries 5.557 Mb/s — the single-station limit 12,000 bits / T_s = 5.561 Mb/s — and the other four stations, obeying the standard, get 5 frames between them in ten seconds. Random backoff is not politeness; it is the only thing making the channel divisible.', zh: '故意把模型玩坏。在编辑器里给五台终端全都挂上“CW = 0”的篡改驱动（cwMin = cwMax = 0，即 W = 1、m = 0）：模型说 τ = 1、p = 1、S = 0，而仿真结果正是如此——23,335 次尝试，其中 23,330 次碰撞（99.98%），零个 ACK，3,330 个 MSDU 因达到重传上限被丢弃。然后把其中四台改回正常，只留一个作弊者：作弊者拿走了全场 4,639 次尝试中的 4,634 次，网络反而还能跑 5.557 Mb/s——正是单终端极限 12,000 比特 / T_s = 5.561 Mb/s——而另外四台遵守标准的终端，十秒里一共只发出了 5 帧。随机退避不是礼貌，它是让信道可以被分割的唯一机制。' },
  ],
  quiz: [
    {
      q: { en: 'The n = 20 network delivers 4.03 Mb/s at 6 Mb/s per frame. Move all twenty stations next to the AP so every frame goes at 54 Mb/s, nine times faster. What does the model predict for the collision probability p?', zh: 'n = 20 的网络在每帧 6 Mb/s 时交付 4.03 Mb/s。把这二十台终端全部挪到 AP 旁边，让每帧都以 54 Mb/s（快九倍）发送。模型预测碰撞概率 p 会怎样？' },
      options: [
        { en: 'p falls: shorter frames mean less time for others to collide with me', zh: 'p 下降：帧更短，别人撞上我的时间就更少' },
        { en: 'p is unchanged at 49.59% — it depends only on n, W and m', zh: 'p 不变，仍是 49.59%——它只取决于 n、W、m' },
        { en: 'p rises: more transmissions per second means more collisions per second', zh: 'p 上升：每秒发送次数更多，每秒碰撞也更多' },
      ],
      answer: 1,
      explain: { en: 'The fixed point contains no airtime at all. Backoff counters freeze while the medium is busy (§10.23.2.4), so the duration of a frame buys no one a chance to collide with it; contention is decided in idle slots. Collisions per *second* do rise, because the whole cycle shortens — that is answer 3\'s grain of truth — but the per-attempt probability, which is what p means, does not move. Measured here: 26.17% close in at a 54 Mb/s ceiling against 25.84% on the arc at 6 Mb/s.', zh: '不动点方程里根本没有空口时间。介质忙时退避计数器是冻结的（§10.23.2.4），所以一帧持续多久，都不会给谁多一次撞上它的机会；竞争是在空闲时隙里决出的。每“秒”的碰撞次数确实会上升，因为整个周期缩短了——这是第三个选项里那点道理——但 p 所指的“每次尝试”的概率不会动。这里实测：贴近 AP、上限 54 Mb/s 时是 26.17%，圆弧上 6 Mb/s 时是 25.84%。' },
    },
    {
      q: { en: 'Those twenty stations at 54 Mb/s: the model says 24.91 Mb/s, the simulator delivers far less. What is the single biggest reason?', zh: '那二十台跑在 54 Mb/s 的终端：模型说 24.91 Mb/s，仿真器交付的远低于此。最主要的原因是什么？' },
      options: [
        { en: 'The model ignores the retry limit, so it counts frames that a real MAC discards', zh: '模型忽略了重传上限，把真实 MAC 会丢弃的帧也算进去了' },
        { en: 'Rate adaptation reads collisions as a bad channel and walks the rate down the MCS ladder', zh: '速率自适应把碰撞当成信道变差，于是沿着 MCS 阶梯把速率往下降' },
        { en: 'Twenty stations exceed the queue limit, so most MSDUs are dropped before transmission', zh: '二十台终端超出了队列上限，大多数 MSDU 在发送前就被丢弃了' },
      ],
      answer: 1,
      explain: { en: 'Two consecutive failed attempts step the MCS down, ten consecutive successes step it back up, and a collision is indistinguishable from fading to that loop (the rate-adaptation lesson). In the n = 5 close-in variant the result is that 67.7% of frames leave at 6 Mb/s and 1.1% at 54 Mb/s, and throughput lands at 5.53 Mb/s against the model\'s 29.52. The retry limit is a real difference but a small one (at n = 20 it costs 1.6% of S), and the queues never fill: a saturated source only refills as frames leave.', zh: '连续两次尝试失败就降一档 MCS，连续十次成功才升一档，而在这个回路看来，碰撞和衰落毫无区别（“速率自适应”那一课）。在 n = 5 的贴近变体里，结果是 67.7% 的帧以 6 Mb/s 发出、只有 1.1% 用到 54 Mb/s，吞吐落在 5.53 Mb/s，而模型给的是 29.52。重传上限确实是一处真实差异，但影响很小（n = 20 时只让 S 少 1.6%）；队列则从不会满：饱和源只在帧离开时补充。' },
    },
    {
      q: { en: 'You measure p̂ by counting RETRY records per data-frame attempt. In which of these networks would that estimator stop measuring the collision probability the model talks about?', zh: '你用“每次数据帧尝试对应多少条 RETRY 记录”来估计 p̂。在下列哪种网络里，这个估计量就不再是模型所说的碰撞概率了？' },
      options: [
        { en: 'The same stations at 54 Mb/s instead of 6 Mb/s', zh: '同样的终端，只是速率从 6 Mb/s 换成 54 Mb/s' },
        { en: 'The same stations, but run for 30 s instead of 10 s', zh: '同样的终端，只是跑 30 秒而不是 10 秒' },
        { en: 'Stations spread over the flat, some barely in range and some behind a wall from each other', zh: '终端散布在整套公寓里，有的勉强在覆盖边缘，有的彼此之间隔着一堵墙' },
      ],
      answer: 2,
      explain: { en: 'A RETRY only means "no ACK came". On an ideal, equal-power, fully-connected channel that can only be a collision, which is why the estimator is valid here. Spread the stations out and the same record starts counting SINR failures at the edge of range, hidden-node collisions the model never posits (it assumes every station hears every other), and frames that a capture-favoured neighbour survived. The rate change moves T_s and T_c but not what a RETRY means, and a longer run only shrinks the sampling error.', zh: '一条 RETRY 只说明“ACK 没来”。在理想、等功率、全连通的信道上，它只可能是碰撞，所以这里这个估计量是成立的。把终端摊开，同样的记录就会把覆盖边缘的 SINR 失败、模型从未设想过的隐藏节点碰撞（它假设每台终端都能听见其他所有终端），以及被捕获效应放过的邻居的帧，一并算进去。换速率只改变 T_s 和 T_c，不改变 RETRY 的含义；跑得更久只会让抽样误差更小。' },
    },
  ],
}
