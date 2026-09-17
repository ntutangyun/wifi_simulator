/**
 * Tier 1 · project · "Predict a flat, then measure it".
 *
 * The closing exercise of Tier 1: one small, deterministic flat whose link
 * budgets, airtimes, collision probability and airtime shares are all
 * computable by hand from the eight lessons before it — predicted first, then
 * measured, then reconciled with the discipline of bianchi-vs-sim.
 *
 * Every number in the prose is recomputed from the engine's own functions, the
 * Bianchi solver and a 10 s run by tests/course/tier1-project.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, N, firstBackoffDraw, firstCollision, firstData, firstRetry, longApartment, node, sc, type Lesson } from '../lessonKit'

/**
 * The flat: a Wi-Fi 7 router on the study shelf, two laptops uploading flat
 * out — one on the study desk, one across the brick wall in the living room —
 * and a phone on a voice call. Everything is 20 MHz, one stream, and only the
 * 4096-QAM capability is switched on: no EDCA, no aggregation, no TXOP, so
 * every exchange is exactly one 1500-byte MSDU answered by one ACK, which is
 * the world the DCF lessons and the Bianchi model describe.
 *
 * `nearX` walks the study laptop down the flat (12 m puts it behind the brick
 * wall next to its neighbour); `third` adds a tablet beside the router;
 * `noFar` sends the living-room laptop away.
 */
export function projectFlat(opts: { nearX?: number; third?: boolean; noFar?: boolean } = {}): Scenario {
  const feats = { qam4k: true }
  const ap = node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats, 1)
  const near = node('sta-1', 'Study laptop', 'sta', opts.nearX ?? 5, 4, 'eht', 'saturated', feats, 1)
  const far = node('sta-2', 'Living-room laptop', 'sta', 14, 6, 'eht', 'saturated', feats, 1)
  const phone = node('sta-3', 'Phone (call)', 'sta', 4, 6, 'eht', 'voice', feats, 1)
  const nodes = [ap, near]
  if (!opts.noFar) nodes.push(far)
  nodes.push(phone)
  if (opts.third) nodes.push(node('sta-4', 'Tablet', 'sta', 2, 6, 'eht', 'saturated', feats, 1))
  for (const n of nodes) n.caps.widthMhz = 20
  return sc(longApartment(), nodes)
}

export const tier1Project: Lesson = {
  id: 'tier1-project',
  module: 1,
  title: {
    en: 'Project — predict a flat, then measure it',
    zh: '项目——先预测一户人家，再去测量它',
  },
  body: [
    { text: {
      en: 'Tier 1 is over. This is the exam it was written for: a flat you have never seen, four quantities you work out with a pencil before you press play, and an honest reckoning with whatever the simulator does instead. Do not open the run until the four predictions are written down — one you adjust after seeing the answer teaches nothing.',
      zh: '第一阶段到此结束。这是它一直在准备的那场考试：一户你没见过的房子、四个在按下播放键之前用纸笔算出来的量，然后与仿真器真正做出的结果做一次诚实的对账。四个预测没写下来之前不要打开仿真——看过答案再改的预测，什么也教不会你。',
    } },

    { kind: 'table', heading: { en: 'The brief', zh: '题面' }, head: [
      { en: 'Device', zh: '设备' }, { en: 'Where', zh: '位置' }, { en: 'Traffic', zh: '业务' },
    ], rows: [
      [{ en: 'Router (AP)', zh: '路由器（AP）' }, { en: 'Study shelf, (3, 4), 20 dBm', zh: '书房架子上，(3, 4)，20 dBm' }, { en: 'Downlink when it has something to send', zh: '只在有东西要发时下行' }],
      [{ en: 'Study laptop', zh: '书房笔记本' }, { en: '(5, 4) — 2 m away, same room, 15 dBm', zh: '(5, 4)——2 m 外，同一房间，15 dBm' }, { en: 'Saturated upload, 1500-byte MSDUs', zh: '饱和上传，1500 字节 MSDU' }],
      [{ en: 'Living-room laptop', zh: '客厅笔记本' }, { en: '(14, 6) — across the brick wall, 15 dBm', zh: '(14, 6)——隔着砖墙，15 dBm' }, { en: 'Saturated upload, 1500-byte MSDUs', zh: '饱和上传，1500 字节 MSDU' }],
      [{ en: 'Phone', zh: '手机' }, { en: '(4, 6) — beside the router, 15 dBm', zh: '(4, 6)——路由器旁边，15 dBm' }, { en: 'Voice call: 200 B every 20 ms, each way', zh: '语音通话：每 20 ms 上下行各 200 字节' }],
    ] },
    { text: {
      en: 'All four radios are Wi-Fi 7 on one 20 MHz channel, one spatial stream, 4096-QAM enabled. EDCA, aggregation and TXOP are off, so every exchange is one MSDU and one ACK — plain DCF. Antennas are 1 m above the floor, so distances are the ones on the floor plan. Predict four things:',
      zh: '四台设备都是 Wi-Fi 7、单条 20 MHz 信道、单空间流、开启 4096-QAM。EDCA、聚合与 TXOP 全部关闭，于是每次交换就是一个 MSDU 加一个 ACK——纯粹的 DCF。天线都离地 1 m，所以距离就是平面图上的距离。要预测的四件事：',
    } },
    { kind: 'list', items: [
      { en: '(a) Each uploader\'s RSSI, SNR and MCS ceiling.', zh: '（a）每台上传设备的 RSSI、SNR 与 MCS 上限。' },
      { en: '(b) The airtime of one data frame, and of its whole exchange.', zh: '（b）一个数据帧的空口时间，以及承载它的整次交换的时长。' },
      { en: '(c) The conditional collision probability p and the saturation throughput S.', zh: '（c）两台竞争终端的条件碰撞概率 p 与饱和吞吐 S。' },
      { en: '(d) How the airtime splits, and how much the fast station loses to the slow one.', zh: '（d）空口时间如何在两者之间分配，以及快终端为慢终端付出了多少。' },
    ] },

    { heading: { en: 'Method (a): the link budget', zh: '方法（a）：链路预算' }, kind: 'steps', items: [
      { en: 'Distance in 3D, walls along the 2D ray. The living-room laptop is √(11² + 2²) = 11.180 m away and its ray crosses one brick wall.', zh: '距离按三维算，穿墙按平面射线判。客厅笔记本距路由器 √(11² + 2²) = 11.180 m，射线穿过一堵砖墙。' },
      { en: 'Path loss = 46.7 + 30·log10(d) = 78.15 dB; brick adds 12 dB.', zh: '路径损耗 = 46.7 + 30·log10(d) = 78.15 dB；砖墙再加 12 dB。' },
      { en: 'RSSI = 15 − 78.15 − 12 = −75.15 dBm. SNR = RSSI − (−93.99) = 18.84 dB.', zh: 'RSSI = 15 − 78.15 − 12 = −75.15 dBm。SNR = RSSI − (−93.99) = 18.84 dB。' },
      { en: 'Ceiling: the highest EHT rung whose required SINR + 3 dB fits. MCS 2 needs 13.99 + 3 = 16.99 dB ✓; MCS 3 needs 16.99 + 3 = 19.99 dB ✗. So MCS 2, 25.8 Mb/s.', zh: '上限：所需 SINR + 3 dB 仍装得下的最高 EHT 级。MCS 2 需 13.99 + 3 = 16.99 dB ✓；MCS 3 需 16.99 + 3 = 19.99 dB ✗。所以是 MCS 2，25.8 Mb/s。' },
      { en: 'Repeat for the study laptop: 2.000 m, no wall, 55.73 dB, −40.73 dBm, 53.26 dB — MCS 13, 172.1 Mb/s, the top of the ladder.', zh: '对书房笔记本重复一遍：2.000 m、无墙、路径损耗 55.73 dB，−40.73 dBm、53.26 dB——MCS 13、172.1 Mb/s，阶梯的顶端。' },
    ] },

    { heading: { en: 'Method (b): airtime', zh: '方法（b）：空口时间' }, kind: 'formula', text: {
      en: 'N_sym = ⌈(16 + 8·L + 6) / N_DBPS⌉      airtime = preamble + N_sym · 13.6 µs',
      zh: 'N_sym = ⌈(16 + 8·L + 6) / N_DBPS⌉      空口时间 = 前导 + N_sym · 13.6 µs',
    }, note: {
      en: 'L = 1500 + 24 (MAC header) + 4 (FCS) = 1528 octets on the air. EHT preamble 48 µs. MCS 2 carries 351 bits per symbol: ⌈12246 / 351⌉ = 35 symbols, 48 + 476 = 524.0 µs. MCS 13 carries 2340: ⌈12246 / 2340⌉ = 6 symbols, 48 + 81.6 = 129.6 µs.',
      zh: 'L = 1500 + 24（MAC 头）+ 4（FCS）= 空口上 1528 字节。EHT 前导 48 µs。MCS 2 每符号 351 比特：⌈12246 / 351⌉ = 35 个符号，48 + 476 = 524.0 µs。MCS 13 每符号 2340 比特：⌈12246 / 2340⌉ = 6 个符号，48 + 81.6 = 129.6 µs。',
    } },
    { kind: 'formula', text: {
      en: 'T_s = data + SIFS + ACK + DIFS        T_c = data + ACKTimeout + DIFS',
      zh: 'T_s = 数据 + SIFS + ACK + DIFS        T_c = 数据 + ACK 超时 + DIFS',
    }, note: {
      en: 'The ACK goes at the highest mandatory rate at or below the data frame\'s non-HT reference rate: 24 Mb/s (28 µs) for MCS 13, 12 Mb/s (32 µs) for MCS 2. So T_s is 129.6 + 16 + 28 + 34 = 207.6 µs for the study laptop and 524.0 + 16 + 32 + 34 = 606.0 µs for the living-room one; T_c is 208.6 and 603.0 µs.',
      zh: 'ACK 以不超过数据帧非 HT 参考速率的最高强制速率发送：MCS 13 对应 24 Mb/s（28 µs），MCS 2 对应 12 Mb/s（32 µs）。于是书房笔记本的 T_s = 129.6 + 16 + 28 + 34 = 207.6 µs，客厅笔记本的 T_s = 524.0 + 16 + 32 + 34 = 606.0 µs；T_c 分别是 208.6 与 603.0 µs。',
    } },

    { heading: { en: 'Method (c): the fixed point', zh: '方法（c）：不动点' }, text: {
      en: 'Two saturated stations, W = 16, m = 6, seven attempts: the Bianchi fixed point gives τ = 0.1046 and p = 10.46%. Neither number knows anything about rate or frame length. Throughput does, and the two stations win equally often, so price a generic successful slot at the mean of the two exchanges: T_s = (207.6 + 606.0)/2 = 406.8 µs, and T_c likewise. That gives S = 25.585 Mb/s in total, 12.793 Mb/s each.',
      zh: '两台饱和终端，W = 16、m = 6、七次尝试：Bianchi 不动点给出 τ = 0.1046、p = 10.46%。这两个数与速率、帧长毫无关系。但吞吐要用到它们，而两台终端获胜的次数相同，所以给“一个成功的通用时隙”定价时取两次交换的平均：T_s = (207.6 + 606.0)/2 = 406.8 µs，T_c 同理为 406.8 µs。由此得到总吞吐 S = 25.585 Mb/s，每台 12.793 Mb/s。',
    } },

    { heading: { en: 'Method (d): the share, and the anomaly', zh: '方法（d）：份额与速率异常' }, text: {
      en: 'DCF is fair in transmission opportunities, so predict equal frame counts and — every frame carrying the same 1500 bytes — equal throughput. Airtime is where the fairness turns ugly: the two data frames are 129.6 and 524.0 µs, so the split is 19.8% against 80.2%. The study laptop pays four fifths of the channel to a neighbour that delivers no more than it does. To size that, predict what it would get alone: 12,000 bits over T_s plus a mean backoff of 7.5 slots — 12,000 / 275.1 µs = 43.621 Mb/s.',
      zh: 'DCF 的公平是“传输机会公平”，所以预测两者帧数相同；又因为每帧都载同样的 1500 字节，吞吐也相同。难看的地方在空口时间：两个数据帧分别是 129.6 与 524.0 µs，于是占用比是 19.8% 对 80.2%。书房笔记本把五分之四的信道让给了一个交付量并不比它多的邻居。要给这份损失定个量，就预测它独占信道时能拿到多少：每次交换 12,000 比特，除以 T_s 加上平均 7.5 个时隙的退避——12,000 / 275.1 µs = 43.621 Mb/s。',
    } },

    { kind: 'list', heading: { en: 'The measurement: what to read where', zh: '测量：各项数据到哪里读' }, items: [
      { en: '(a) Jump to each laptop\'s first data frame: the Inspector shows the frame\'s MCS and rate, and the node panel the RSSI and SNR of its link to the router.', zh: '（a）跳到每台笔记本的第一个数据帧：检视器显示帧的 MCS 与速率，节点面板显示它到路由器那条链路的 RSSI 与 SNR。' },
      { en: '(b) Hover the same block for its duration, then step to the ACK: the gap is one SIFS, and DIFS follows the ACK.', zh: '（b）悬停同一色块读出精确时长，再步进到 ACK：中间的间隙是一个 SIFS，ACK 之后跟着 DIFS。' },
      { en: '(c) Count data TX_START records for attempts and RETRY records for failures — but read the gap analysis below before calling that ratio p. COLLISION records count the overlaps themselves.', zh: '（c）按终端统计数据帧的 TX_START 记录得到尝试次数，统计 RETRY 记录得到失败次数——但在把这个比值叫作 p 之前，先读下面的偏差分析。COLLISION 记录统计的才是重叠本身。' },
      { en: '(d) The per-node stats give delivered frames and accumulated airtime; throughput is 12,000 bits per acknowledged frame over the run length.', zh: '（d）每节点统计给出成功交付的帧数与累计空口时间；吞吐 = 每个被确认的帧记 12,000 比特，除以仿真时长。' },
    ] },

    { kind: 'table', heading: { en: 'Predicted vs measured (10 s, seed 7)', zh: '预测对实测（10 秒，种子 7）' }, head: [
      { en: 'Quantity', zh: '量' }, { en: 'Predicted', zh: '预测' }, { en: 'Measured', zh: '实测' },
    ], rows: [
      [{ en: 'Study laptop: RSSI / SNR / MCS', zh: '书房笔记本：RSSI / SNR / MCS' }, N('−40.73 dBm / 53.26 dB / 13'), { en: 'MCS 13 on the first frame', zh: '第一帧就是 MCS 13' }],
      [{ en: 'Living-room laptop: RSSI / SNR / MCS', zh: '客厅笔记本：RSSI / SNR / MCS' }, N('−75.15 dBm / 18.84 dB / 2'), { en: 'MCS 2 on the first frame', zh: '第一帧就是 MCS 2' }],
      [{ en: 'Data frame / exchange (study)', zh: '数据帧 / 交换（书房）' }, N('129.6 / 207.6 µs'), { en: '129.6 µs; run mean 148.1 µs', zh: '129.6 µs；全程均值 148.1 µs' }],
      [{ en: 'Data frame / exchange (living room)', zh: '数据帧 / 交换（客厅）' }, N('524.0 / 606.0 µs'), { en: '524.0 µs; run mean 600.9 µs', zh: '524.0 µs；全程均值 600.9 µs' }],
      [{ en: 'Collision probability p', zh: '碰撞概率 p' }, N('10.46 %'), { en: '23.15 % of attempts overlap; 12.59 % end in a retry', zh: '23.15% 的尝试发生重叠；12.59% 以重传收场' }],
      [{ en: 'Throughput, both contenders', zh: '两台竞争终端的总吞吐' }, N('25.585 Mb/s'), N('22.610 Mb/s')],
      [{ en: 'Frames each', zh: '各自帧数' }, { en: 'equal', zh: '相同' }, N('9,719 / 9,123')],
      [{ en: 'Airtime split', zh: '空口时间占比' }, N('19.8 % / 80.2 %'), N('21.2 % / 78.8 %')],
      [{ en: 'Study laptop alone', zh: '书房笔记本独占信道' }, N('43.621 Mb/s'), N('42.470 Mb/s')],
    ] },

    { heading: { en: 'Reading the gaps', zh: '读懂偏差' }, kind: 'steps', items: [
      { en: 'Estimator. RETRY per attempt is not p here. There were 4,990 overlapping attempts but only 2,713 retries: capture let about 46% of the losers through, because the study laptop\'s frames arrive 34 dB above the living-room laptop\'s. Two errors of opposite sign left 12.59% looking deceptively close to 10.46%.', zh: '估计量。这里“每次尝试的 RETRY 数”不是 p。重叠的尝试有 4,990 次，重传只有 2,713 次：捕获效应放过了约 46% 的输家，因为书房笔记本的帧比客厅笔记本强 34 dB。两个符号相反的误差，让 12.59% 看上去与 10.46% 近得可疑。' },
      { en: 'Assumption. "Everyone in range" fails in one direction. The two laptops hear each other at −72.64 dBm — above −82 dBm, so a preamble is detected and backoff freezes. But a station transmitting when the other\'s preamble arrived never caught it, and −72.64 dBm is far below the −62 dBm energy threshold: it believes the channel is idle while a 524 µs frame is still running.', zh: '假设。“彼此都在覆盖内”在一个方向上不成立。两台笔记本互相收到的电平是 −72.64 dBm——高于 −82 dBm，所以前导能被检测到、退避随之冻结。但如果对方的前导到达时本机正在发送，它就永远抓不到那个前导，而 −72.64 dBm 远低于 −62 dBm 的能量门限。于是在一个 524 µs 的帧还在空中时，它认为信道是空闲的。' },
      { en: 'Mechanism and size. Of 2,399 laptop-against-laptop collisions, 1,342 are exactly that: a second collision piled onto the first, the short-frame station having finished its ACK timeout, waited DIFS and transmitted again on top of a frame it could no longer hear. That one mechanism roughly doubles the true overlap rate, 10.46% → 23.15%.', zh: '机制与量级。在 2,399 次“笔记本对笔记本”的碰撞中，有 1,342 次正是如此：第一次碰撞之上又叠了第二次，因为短帧的一方等完 ACK 超时、再等一个 DIFS，就又发到了一个它已经听不见的帧上。仅这一个机制就把真实重叠率翻了约一倍，10.46% → 23.15%。' },
      { en: 'Residual. Throughput falls 11.6% short of 25.585 Mb/s, and rate control takes most of it: the mean PPDU is 148.1 µs against a predicted 129.6, and 600.9 against 524.0. ARF steps down after two consecutive failures and cannot tell a collision from fading. What is left, a couple of points, stays unexplained — and saying so is part of the answer.', zh: '残差。吞吐比 25.585 Mb/s 少了 11.6%，其中大部分要记在速率控制头上：PPDU 均值是 148.1 µs（预测 129.6）与 600.9 µs（预测 524.0）。ARF 连续两次失败就降档，而它分不清碰撞与衰落。剩下的两个百分点仍无法解释——如实说出来也是答案的一部分。' },
    ] },
    { text: {
      en: 'One restart-time detail completes the picture: 9,499 EIFS deferrals. The living-room laptop hears the study laptop at 21.35 dB but its MCS 13 frames need 44.99 dB, so every one is a failed reception — and that costs EIFS (94 µs), not DIFS (34 µs). Three clocks, one event: 45 µs for the colliders, 94 for the station that locked on and failed, 34 for the one that heard nothing.',
      zh: '还有一个重启时刻的细节补全了这幅图：9,499 次 EIFS 延迟。客厅笔记本收到书房笔记本的 SINR 是 21.35 dB，而对方 MCS 13 的帧需要 44.99 dB，所以每一帧对它都是一次失败的接收——代价是 EIFS（94 µs），不是 DIFS（34 µs）。一次事件，三个时钟：碰撞双方 45 µs，锁上却解不出来的一方 94 µs，什么也没听到的一方 34 µs。',
    } },

    { kind: 'table', heading: { en: 'Self-check rubric', zh: '自评标准' }, head: [
      { en: 'Quantity', zh: '量' }, { en: 'A good answer', zh: '好答案长什么样' },
    ], rows: [
      [N('(a)'), { en: 'Both RSSIs within 1 dB, the brick wall counted once, and the ceiling justified by a named rung and its required SINR + 3 dB.', zh: '两个 RSSI 误差都在 1 dB 以内，砖墙只数一次，且上限要用某一级及其“所需 SINR + 3 dB”说清楚——而不是“看着差不多”。' }],
      [N('(b)'), { en: 'Symbols rounded up, 28 octets of MAC overhead included, and the ACK\'s rate derived from the non-HT reference rate, not assumed equal to the data rate.', zh: '符号数向上取整，算进 28 字节 MAC 开销，ACK 的速率由非 HT 参考速率推出，而不是想当然地等于数据速率。' }],
      [N('(c)'), { en: 'p quoted without reference to rate or frame length, S built from a generic slot holding both exchange times, the estimator named before it is measured.', zh: 'p 的给出与速率、帧长无关；S 由包含两种交换时长的通用时隙算出；在测量之前先说清楚用的是哪个估计量。' }],
      [N('(d)'), { en: 'Equal frames but unequal airtime, the split computed from the frame durations, the fast station\'s loss stated against what it would get alone.', zh: '帧数相同而空口时间不同，占比由帧时长算出，并把快终端的损失与它独占信道时的结果做对照。' }],
      [{ en: 'Gaps', zh: '偏差' }, { en: 'Two mechanisms named and sized in the model\'s own units, the residual reported rather than fitted away.', zh: '至少点名两个机制，各自用模型自己的单位定量，并把残差如实报告，而不是拟合掉。' }],
    ] },
  ],

  scenario: () => projectFlat(),
  variants: [
    {
      label: { en: 'The study laptop moves to the living room', zh: '书房笔记本搬进客厅' },
      scenario: () => projectFlat({ nearX: 12 }),
    },
    {
      label: { en: 'A third contender: a tablet beside the router', zh: '第三个竞争者：路由器旁的平板' },
      scenario: () => projectFlat({ third: true }),
    },
    {
      label: { en: 'The living-room laptop leaves', zh: '客厅笔记本离线' },
      scenario: () => projectFlat({ noFar: true }),
    },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first collision', '第一次碰撞', firstCollision),
    J('first retry', '第一次重传', firstRetry),
    J('first backoff draw', '第一次退避抽签', firstBackoffDraw),
  ],
  observe: [
    { en: 'Both laptops find the medium idle at t = 0 and transmit together. The study laptop\'s 129.6 µs block ends long before the living-room one\'s 524.0 µs block — and then it comes back at 406.6 µs and lands on that very frame, still running. The deaf late start, in the first millisecond.', zh: '两台笔记本在 t = 0 都发现介质空闲，一起发送。书房笔记本 129.6 µs 的色块远早于客厅那块 524.0 µs 结束——然后它在 406.6 µs 又回来了，正好踩在那个仍在进行的帧上。“聋掉的迟到起跑”，就发生在第一毫秒里。' },
    { en: 'Hover the living-room laptop\'s defer blocks after a study-laptop frame: they read EIFS, 94 µs, not DIFS. It locked onto a preamble at 21.35 dB and could not decode a frame asking for 44.99 dB, so it must assume an ACK it cannot hear is on its way.', zh: '在书房笔记本发完一帧之后，悬停客厅笔记本的等待色块：上面写的是 EIFS、94 µs，而不是 DIFS。它以 21.35 dB 锁上了前导，却解不出一个要求 44.99 dB 的帧，于是必须假设有一个它听不见的 ACK 正在路上。' },
    { en: 'Read the two green lanes side by side: the blocks come in comparable numbers (9,719 against 9,123 delivered) but the living-room lane is dark four times as long. Equal opportunities, unequal airtime — the anomaly, in one screenful.', zh: '把两条绿色泳道并排看：色块的数量相当（成功交付 9,719 对 9,123），但客厅那条泳道被占满的时间是四倍。机会相同、空口不同——一屏之内就是速率异常。' },
  ],
  tryThis: [
    { en: 'Predict the first variant before running it. The study laptop moves to (12, 4): 9.000 m plus the brick wall gives −72.33 dBm, 21.66 dB, MCS 3 — a 415.2 µs frame and T_s = 493.2 µs. p is unchanged at 10.46% (only n, W and m enter it), and S falls to 19.350 Mb/s, 9.675 each. The run gives 16.796 Mb/s (8.737 and 8.059) and 11.10% of attempts overlapping. Note which number got dramatically better: with both frames now long and similar, the deaf late start almost disappears.', zh: '在跑第一个变体之前先预测它。书房笔记本搬到 (12, 4)：9.000 m 加一堵砖墙给出 −72.33 dBm、21.66 dB、MCS 3——帧长 415.2 µs，T_s = 493.2 µs。p 仍是 10.46%（不动点里只有 n、W、m），S 降到 19.350 Mb/s，每台 9.675。实跑给出 16.796 Mb/s（8.737 与 8.059），重叠率 11.10%。注意是哪个数急剧变好了：现在两个帧都长且相近，“聋掉的迟到起跑”几乎消失。' },
    { en: 'Now the other two. Adding the tablet makes n = 3: p rises to 17.81%, and S, with two fast exchanges and one slow one averaged into the generic slot, is 29.574 Mb/s. Measured: 17.13% retried and 21.184 Mb/s (7.734, 5.852, 7.597) — p almost exact, S 28% short, because the living-room laptop now collides so often that ARF walks it down to MCS 0. Remove that laptop instead and the study laptop should get 43.621 Mb/s; it gets 42.470, retrying 0.28%.', zh: '再看另外两个。加上平板就是 n = 3：p 升到 17.81%，把两次快交换与一次慢交换平均进通用时隙后，S = 29.574 Mb/s。实测：17.13% 的尝试重传，吞吐 21.184 Mb/s（7.734、5.852、7.597）——p 几乎分毫不差，S 却少了 28%，因为客厅笔记本现在碰撞得太频繁，ARF 把它一路压到了 MCS 0。反过来撤掉那台笔记本，书房笔记本应当拿到 43.621 Mb/s；它拿到 42.470，重传率 0.28%。' },
  ],
  quiz: [
    {
      q: { en: 'Your predicted p is 10.46% and the run retries 12.59% of attempts. Why is agreeing at this point a mistake?', zh: '你预测的 p 是 10.46%，实跑中 12.59% 的尝试发生了重传。为什么此刻就宣告一致是个错误？' },
      options: [
        { en: 'Because 12.59% is outside the 10% tolerance the model deserves', zh: '因为 12.59% 超出了模型应有的 10% 容差' },
        { en: 'Because the estimator does not measure the model\'s quantity here: 23.15% of attempts actually overlap, and capture rescues about 46% of the losers', zh: '因为这里的估计量测的不是模型里的那个量：实际有 23.15% 的尝试重叠，而捕获效应救回了约 46% 的输家' },
        { en: 'Because ten seconds is too short a sample', zh: '因为十秒的样本太短' },
      ],
      answer: 1,
      explain: { en: 'A retry counts a lost frame, not an overlap, and in a flat with a 34 dB spread those are different events. The near agreement is two errors of opposite sign cancelling; the honest reading names both. Ten seconds is thousands of attempts, and the model has no tolerance band.', zh: '重传统计的是丢失的帧，而不是重叠；在一户信号相差 34 dB 的房子里，这是两件不同的事。这份“接近”是两个符号相反的误差相互抵消，诚实的读法要把两者都点名。十秒已经是数千次尝试，而模型本身也没有什么容差带。' },
    },
    {
      q: { en: 'The study laptop transmits a second time while the living-room laptop\'s frame is still on the air. Which rule allows that?', zh: '客厅笔记本的帧还在空中时，书房笔记本又发了一次。是哪条规则允许了这件事？' },
      options: [
        { en: 'The NAV had already expired, so the channel was formally free', zh: 'NAV 已经到期，所以信道在形式上是空闲的' },
        { en: 'Its preamble was missed because the radio was transmitting, so only energy detection applies — and −72.64 dBm is below −62 dBm', zh: '那个前导在本机发送期间到达而被错过，于是只剩能量检测可用——而 −72.64 dBm 低于 −62 dBm' },
        { en: 'A station may always start after its ACK timeout plus DIFS', zh: '终端在 ACK 超时加一个 DIFS 之后总是可以起始发送' },
      ],
      answer: 1,
      explain: { en: 'The −82 dBm threshold applies only to a PPDU whose preamble the radio actually detected; anything else is energy, and energy must reach −62 dBm to hold CCA busy. Neither frame sets a NAV the other can read, and the ACK timeout only says when to stop waiting — carrier sense still governs when a station may start.', zh: '−82 dBm 的门限只适用于电台确实检测到了前导的 PPDU；其余一切只算能量，而能量必须达到 −62 dBm 才能让 CCA 置忙。两个帧都没有给对方留下可读的 NAV；ACK 超时只告诉终端何时停止等待，何时可以起始发送仍由载波侦听说了算。' },
    },
    {
      q: { en: 'Which prediction would you trust least if the same flat ran at 160 MHz instead of 20?', zh: '如果同一户人家把信道从 20 MHz 换成 160 MHz，你最不信任哪一个预测？' },
      options: [
        { en: 'p — it would change with the width', zh: 'p——它会随带宽改变' },
        { en: 'The MCS ceilings — the noise floor rises 9 dB and the living-room link may fall off the ladder entirely', zh: 'MCS 上限——噪声底升高 9 dB，客厅那条链路可能整个跌出阶梯' },
        { en: 'The airtime split — wider channels are shared differently', zh: '空口占比——更宽的信道分享方式不同' },
      ],
      answer: 1,
      explain: { en: 'p depends only on n, W and m. The split still follows the frame durations, whatever they become. But the noise floor goes from −93.99 to −84.96 dBm, so the living-room laptop\'s 18.84 dB of SNR becomes 9.81 dB — under MCS 0\'s requirement with margin, and the required SINR itself does not change with width.', zh: 'p 只与 n、W、m 有关。占比也仍旧跟随帧时长，不论帧时长变成多少。但噪声底会从 −93.99 升到 −84.96 dBm，客厅笔记本 18.84 dB 的 SNR 变成 9.81 dB——低于含余量的 MCS 0 要求；而所需 SINR 本身并不随带宽改变。' },
    },
  ],
}
