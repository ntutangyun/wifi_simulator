/**
 * Wi-Fi Tier 1 · M6 · The prediction against the run — second half.
 *
 * New in the 2026-09-25 re-pacing (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2, M6): the close-in run, where the same two equations that were within a few
 * per cent on the arc are out by a factor of five, and the culprit is not
 * contention. It loads `bianchi-vs-sim`'s own scene and its two variants — the
 * same builder, the same array — so the two ids replay to the same recorded
 * timeline hashes and the split costs the reader nothing.
 *
 * The lesson's one procedure is a DIAGNOSIS, not an engine rule: compare the two
 * collision figures, clear contention, read the rate histogram, reprice the
 * exchange with the airtime the run actually spent, and solve again. Its last
 * step is the lesson's payoff and is measured rather than asserted: repricing T_s
 * with the run's own mean data time (1723.7 µs instead of the assumed 248) puts
 * the model at 5.547 Mb/s against a measured 5.534 — 0.24 % apart, with no fitted
 * constant anywhere. That is what "the price was wrong, the rules were not" means
 * quantitatively.
 *
 * What is NOT here, against §2's expectation: the capture material from
 * `anomaly`. Every station in this scene sits on a 1 m circle round the access
 * point and arrives at exactly −36.215 dBm, so no frame is ever louder than
 * another and capture never fires — the access point's RX_MISS count equals the
 * RETRY count exactly (1635 in 10 s). Moving a mechanism here that this scene
 * refutes is the defect the plan's own §7 test forbids, so it stays where a run
 * shows it. See the report of batch E.
 *
 * Every figure is pinned by tests/course/rate-vs-model.test.ts.
 */
import { type Lesson } from '../lessonKit'
import { bianchiScenario } from './bianchi'
import { bianchiVsSimJumps, bianchiVsSimVariants } from './bianchi-vs-sim'

export const rateVsModel: Lesson = {
  id: 'rate-vs-model',
  module: 5,
  title: '移到近处：吞吐量的损失来自速率降档',
  why: '把上一课的五台站点（station, STA）从三米的圆弧移到接入点（access point, AP）近旁，链路（link）速率立即提高到九倍，而理论计算给出的吞吐量应为 29.5 Mb/s。实测只有 5.5。规则没有任何一条失效，方程也没有任何错误——错的是方程中一帧的空口时间（airtime）。实测的碰撞比例与预测几乎相同，所以竞争不是原因，原因在速率：连续失败的发送方会降档，而它无法区分“与其他站点发生碰撞”和“信号变弱”；速率降得越低帧越长，帧越长越容易发生碰撞，于是再次降档。结果这条链路明明能够支持最快的一级，这一级却几乎没有被使用，三分之二的帧降到最慢的一级，一帧的平均空口时间达到模型假设值的七倍。只把方程中的帧长换成实测的平均值，其余几项不变，预测就与实测吻合，只相差千分之二左右。这不是拟合：帧长本来就是模型需要的输入，它原先使用的是一个错误的值，这里没有新增任何自由参数。',
  outcomes: [
    '用两个碰撞数据判断“竞争”是否是原因',
    '解读一张速率直方图，把损失的吞吐量归因于真正的机制',
    '用实测的平均帧长替换模型中的假设值，并说明这为什么不是拟合',
  ],
  needs: ['bianchi-vs-sim', 'anomaly'],
  terms: [
    { term: 'rate control', plain: '发送方在帧连续失败之后降到更慢、更稳健的一级；它把碰撞和信号变弱视为同一种情况' },
    { term: 'CARA', plain: '碰撞感知速率自适应：降档之前先用一个短帧试探，以免把碰撞误判为衰落' },
  ],
  picture: [
    { heading: '相同的规则，五分之一的结果', text: '这就是本课的基础场景：五台饱和的站点位于接入点周围一米的圆上，每一条链路都能支持最快的一级。模型给出 29.52 Mb/s，实测为 5.53。偏差不是几个百分点，而是五倍——这么大的偏差，绝不应以“误差”来解释。' },
    { kind: 'watch', jump: 1, heading: '观察色块长度的变化', text: '载入基础场景，跳到第一次碰撞，再向后查看。发送方的速率在各档之间升降，绿色色块的长度也随之变化：248 µs、704 µs、2064 µs。再切换到「n = 5 在圆弧上」：每个色块的长度又都相同了。这就是固定速率假设不成立与成立时的对比。' },
    { heading: '先排除竞争这一原因', text: '遇到这么大的偏差，第一步都是逐一排除可能的原因，而不是猜测。方程真正预测的只有一个量：一次尝试与其他站点发生碰撞的概率。这个数实测是 26.17%，预测是 27.22%——吻合程度比圆弧上还好。因此竞争不是原因，接入规则的运行与论文描述的一致。' },
    { heading: '变长的是一帧的空口时间', text: '模型为一次成功计算的开销，是一帧在最快一级上的 248 µs。实测中这五台站点发出的帧平均占用 1723.7 µs——因为连续失败的发送方会降档，而它无法区分“与其他站点发生碰撞”和“信号变弱”。碰撞越频繁，它的速率降得越低；速率越低，每一帧越长，于是碰撞更加频繁。这个正反馈过程在“性能异常”一课中已经提到，这里它使实际吞吐量只有理论预测的五分之一。' },
    { heading: '换成实测的帧长，方程即与实测吻合', text: '只把 T_s 中的帧长换成实测的平均帧长，其余三项不变，方程给出 5.547 Mb/s，而实测是 5.534——相差 0.24%。这不是调整参数，而是代入了一个本来就应由测量提供的输入。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样的五台站点移到近处', head: [
      '近处实测', '圆弧上', '预测',
    ], rows: [
      ['碰撞：26.17 %', '25.84 %', '27.22 %'],
      ['吞吐：5.534 Mb/s', '4.717 Mb/s', '29.52 Mb/s'],
      ['平均帧长：1723.7 µs', '2064 µs', '按假设 248 µs'],
      ['以最慢速率发出的帧：67.7 %', '100 %', '按假设为零'],
    ] },
    { heading: '如何解读这张表', text: '第一行排除了竞争：近处站点的碰撞与论文预测的一样多。第三行才是原因：模型假设的 248 µs，在实测中是 1723.7 µs。竞争情况没有变化，一帧的空口时间却增大到约七倍。' },
    { kind: 'table', heading: '这十秒内 6248 帧在各速率档位上的分布', head: [
      '数据速率', '帧数', '占比', '每帧时长',
    ], rows: [
      ['54 Mb/s（链路的上限）', '69', '1.1 %', '248 µs'],
      ['48 Mb/s', '96', '1.5 %', '276 µs'],
      ['36 Mb/s', '163', '2.6 %', '364 µs'],
      ['24 Mb/s', '136', '2.2 %', '532 µs'],
      ['18 Mb/s', '165', '2.6 %', '704 µs'],
      ['12 Mb/s', '518', '8.3 %', '1044 µs'],
      ['9 Mb/s', '869', '13.9 %', '1384 µs'],
      ['6 Mb/s（最慢的一级）', '4232', '67.7 %', '2064 µs'],
    ] },
    { heading: '一张直方图即可说明', text: '这条链路的信噪比（SNR）为 57.8 dB，足以支持最快的一级，但只有 1.1% 的帧使用了这一级；三分之二的帧降到了最慢的一级，也就是圆弧上使用的那一级。一个机制、一张表，已足以说明问题。' },
    { kind: 'steps', heading: '把五倍的偏差定位到一个机制', items: [
      '先核对方程真正预测的那个量：实测的重传（retry）比例与预测的碰撞概率。两者吻合，就排除竞争；两者不符，才回头检查接入规则。',
      '再确认这两个数描述的是同一件事：接入点的“错失”计数与重传计数相等，说明没有任何一帧因捕获效应（capture effect）而仍被正确接收——捕获效应指接收机一旦锁定某个前导码（preamble）就保持锁定，只有遇到明显更强的前导码时才转而与之同步——因此重传比例就是碰撞比例。',
      '把实际发出的帧按数据速率分组，统计各组的数量。一张直方图会立即显示，发送端是否根本没有使用它本可以使用的那一级。',
      '算出实测的平均帧长：把所有数据帧（data frame）的空口时间相加，再除以帧数。这十秒内是 1723.7 µs，而模型假设的是 248。',
      '只把 T_s 与 T_c 中的帧长换成这个实测值，其余三项——短帧间间隔（SIFS）、确认帧（ACK）、分布式帧间间隔（DIFS）——都保持不变，再求解一次不动点。',
      '把新的预测与实测对照：5.547 对 5.534 Mb/s。差距降到千分之二，说明损失的那五分之四吞吐量，完全来自“一帧变长”这一个原因。',
    ] },
    { heading: '这不是仿真器的缺陷', text: '把碰撞误判为衰落的速率控制，是真实设备的普遍行为，也正是碰撞感知速率自适应这类方案所要解决的问题：CARA 在降档前先用一个请求发送帧（RTS）试探，另一些方案改用短窗口内的丢包率而不是“连续失败计数”。这里两者都没有建模；近处这次仿真的意义，就是说明它们为什么存在。' },
  ],
  deeper: [
    { heading: '为什么这个正反馈会不断加剧', text: '降一级，帧就变长一些；帧变长，两台站点同时在空中的时间就增加；重叠增加，失败随之增加，于是再降一级。圆弧上没有这个正反馈，因为速率已处于最低一级、无法再降——上一课的场景之所以把每台站点放得那么远、发射功率设得那么低，就是为了切断它。这也说明：一个模型的假设不能只是“大致成立”，它要么通过场景布置使之成立，要么必须明确指出。' },
    { heading: '为什么 1.1% 比 67.7% 更能说明问题', text: '如果速率控制只是偶尔选错一级，看到的会是一个以最快一级为主、偶有跌落的分布。这里恰恰相反：最快的一级几乎没有被使用。这说明发送端不是在“探索”，而是长期停留在低档——判据是分布的形状，而不是某一个百分位。' },
    { heading: '区分替换输入与拟合', text: '拟合会引入一个自由参数，然后选取使两条曲线重合的值；由此得到的吻合，只是引入自由度的结果。替换这个输入不引入任何参数：T_s 本来就需要一个帧长，而模型使用的是一个错误的值。代入测量提供的那个数之后，剩下的 0.24% 才是真正的残差。这两种做法的区别，就是这门课与“调整一个常数”的区别。' },
  ],
  limits: [
    { kind: 'model-value', text: '降档规则本身是引擎的取值：同一个对端连续两次失败降一档，连续十次成功升一档，且永远不超过按信噪比查表得到的上限（rate.ts 的 RateControl）。标准把速率选择完全留给实现，所以这两个数，以及「任何一次成功都会把失败计数清零」这个细节，都不是标准规定的行为。真实驱动中 Minstrel 一类算法按一段时间窗内的实测吞吐量对候选速率排序，降档与回升的过程都与这里不同。' },
    { kind: 'unmodelled', text: '把碰撞误判为衰落是本课的核心问题，而引擎中没有任何机制去区分两者：一次未收到应答就是一次失败，既不检查是否收到了出错的帧，也不发送探测帧。CARA 先用一个 RTS 试探、RRAA 改用短窗口内的丢包率，这两类改进本课只是提及，引擎均未实现。所以这里看到的正反馈比采用这些算法的真实设备更强烈。' },
    { kind: 'unmodelled', text: '一米圆上五台站点到达接入点的电平完全相同（−36.215 dBm），捕获因此从不触发，重传数才等于重叠数。真实的近距离房间中各站点相差十几分贝，较强的那一帧往往能被正确解出，于是「重传比例就是碰撞比例」这一步不再成立。本课对竞争的排除，依赖于这一场景布置。' },
    { kind: 'out-of-scope', text: '这条链路的信噪比为 57.8 dB，而它的电平在默认场景中不随时间变化，所以这里的每一次降档都只能由碰撞引起——这正是本课所需的单一变量实验。真实设备的降档中总包含衰落造成的部分，两个原因无法分开。编辑器的「时变链路（衰落）」一节可以开启电平起伏，此时这张速率直方图就不再只反映单一原因。', until: 'fading' },
  ],
  sources: [
    '速率选择算法不是标准规定的：IEEE Std 802.11-2024 把速率交给实现，所以这里降档的具体规则是本仿真器的模型取值，与“自动速率回退”那一课讲的同一套。',
    '一次交互的四项——帧、短帧间间隔、确认帧与分布式帧间间隔——见 §10.3.4 与 §10.7.6 的控制回应速率规则；重传前的等待从 ACK 超时结束时开始计时，见 §10.3.2.9。',
    '15 dBm 的近处场景、种子 7、十秒采样窗口，以及上面每一个计数与平均值，都可由场景自己的种子复现。碰撞感知速率方案是 CARA（Kim 等，INFOCOM 2006）与 RRAA（Wong 等，MobiCom 2006）。',
  ],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: bianchiVsSimVariants,
  jumps: bianchiVsSimJumps,
  observe: [
    '绿色色块的长度不断变化：最快一级 248 µs，最慢一级 2064 µs。切换到圆弧变体，每个色块的长度就都相同了。',
    '查看整条绿色泳道：最快一级的短色块只在开头附近出现。7.661 ms 处出现第一帧降档的帧，此后速率再也没有长时间回升。',
  ],
  tryThis: [
    '把基础场景和「n = 5 在圆弧上」各运行十秒，把四个数并列：碰撞 26.17% 对 25.84%，吞吐量 5.534 对 4.717 Mb/s。近处速率更高的链路，交付的数据却只多一点——把这一点写成一行结论。',
    '亲自替换一次这个输入：从日志中取出所有数据帧的空口时间之和与帧数，算出 1723.7 µs，把它代入 T_s 与 T_c，再求解一次不动点。结果应为 5.547 Mb/s，而不是 29.52。',
  ],
  quiz: [
    {
      q: '近处实测只交付了预测值的约五分之一。哪一项测量能最快定位原因？',
      options: [
        '有多少帧最终被放弃了',
        '实际发出的帧在各数据速率上的分布',
        '各站点的队列（queue）深度',
      ],
      answer: 1,
      explain: '实测的碰撞比例已经与预测吻合，所以竞争不是原因。速率分布用一张直方图就揭示了机制：只有 1.1% 的帧使用了链路支持的最高速率。',
    },
    {
      q: '把 T_s 里的帧长换成实测的 1723.7 µs，预测就落到 5.547 Mb/s。为什么这不算“调整参数”？',
      options: [
        '因为还剩 0.24% 的差距，没有完全重合',
        '因为帧长本来就是模型需要的输入，而它原先使用的是一个错误的值；没有新增任何自由度',
        '因为实测值总是比假设值更可信',
      ],
      answer: 1,
      explain: '拟合会引入一个自由参数去逼近曲线；这里没有新参数，只是代入了一个本应由测量提供的输入。剩下的 0.24% 才是残差。',
    },
  ],
}
