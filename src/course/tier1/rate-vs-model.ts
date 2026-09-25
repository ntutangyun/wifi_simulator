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
  title: '挪到近处：崩掉的是速率',
  why: '把上一课那五台站点（station, STA）从三米的圆弧搬到接入点（access point, AP）跟前，链路（link）一下子快了九倍，而纸上的答案说吞吐该有 29.5 Mb/s。实跑只给了 5.5。规则一条都没坏，方程一个字都没错——错的是价钱。这一课教你怎么把这种五倍的分歧定位到一个机制上，而不是耸耸肩说“仿真器不准”。',
  outcomes: [
    '用两个碰撞数字判断“竞争”是不是嫌疑人',
    '读一张速率直方图，把崩掉的那部分吞吐归到它真正的成因上',
    '拿实测的平均帧长给模型重新定价，并说清这为什么不是拟合',
  ],
  needs: ['bianchi-vs-sim', 'anomaly'],
  terms: [
    { term: 'rate control', plain: '发送方在帧接连失败之后退到更慢、更结实的那一级；在它看来，撞车和信号变弱是同一件事' },
    { term: 'CARA', plain: '碰撞感知速率自适应：降档之前先拿一个小帧探一探，免得把撞车读成衰落' },
  ],
  picture: [
    { heading: '一样的规则，五分之一的结果', text: '这就是本课的基础场景：五台饱和的站点站在接入点周围一米的圆上，每一条链路都扛得住最快的那一级。模型说 29.52 Mb/s，实跑给出 5.53。分歧不是几个百分点，是五倍——这么大的分歧，从来不该靠“误差”解释过去。' },
    { kind: 'watch', jump: 1, heading: '看那些色块的长度在变', text: '载入基础场景，跳到第一次碰撞，再往后翻。发送方在阶梯上上下下，绿色色块的长度也一直跟着变：248 µs、704 µs、2064 µs。再切到「n = 5 在圆弧上」：每个色块又都一样长了。这就是固定速率假设的关与开。' },
    { heading: '先给竞争开一张不在场证明', text: '任何一次这么大的分歧，第一步都是把嫌疑人一个个排除，而不是猜。方程真正预测的只有一件事：一次尝试撞上别人的概率。这个数实测是 26.17%，预测是 27.22%——吻合得比圆弧上还好。于是竞争不是嫌疑人，接入规则跑得和论文写的一样。' },
    { heading: '崩掉的是一帧的价钱', text: '模型给一次成功定的价，是一帧在最快那一级上的 248 µs。实跑里这五台站点发出的帧平均要占 1723.7 µs——因为接连失败的发送方会往下降档，而它分不清“撞车了”和“信号弱了”。撞得越勤，它降得越低；降得越低，每一帧越长，于是撞得更勤。这个回路“性能异常”那一课已经点过名，这里它把一个纸上的预测拆成了五分之一。' },
    { heading: '换回真价钱，方程就对了', text: '只把 T_s 里那个帧长换成实测的平均帧长，其余三项照旧，方程给出 5.547 Mb/s，而实测是 5.534——差 0.24%。这不是调参数，而是把一个本来就该由测量提供的输入喂了进去。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样五台站点，挪到近处', head: [
      '近处实测', '圆弧上', '预测',
    ], rows: [
      ['碰撞：26.17 %', '25.84 %', '27.22 %'],
      ['吞吐：5.534 Mb/s', '4.717 Mb/s', '29.52 Mb/s'],
      ['平均帧长：1723.7 µs', '2064 µs', '按假设 248 µs'],
      ['以最慢速率发出的帧：67.7 %', '100 %', '按假设为零'],
    ] },
    { heading: '这张表怎么读', text: '第一行是不在场证明：近处的站点碰撞得和论文说的一样多。第三行才是罪证：模型定价用的 248 µs，在实跑里是 1723.7 µs。竞争没变，一帧的价钱变了七倍。' },
    { kind: 'table', heading: '这十秒里，6248 帧各走了哪一级', head: [
      '数据速率', '帧数', '占比', '一帧多久',
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
    { heading: '一张直方图就够了', text: '这条链路有 57.8 dB 的信噪比（SNR），最快那一级绰绰有余，可只有 1.1% 的帧用上了它；三分之二的帧掉到了最慢的一级，也就是圆弧上那一级。一个机制，一张表，不需要再多说什么。' },
    { kind: 'steps', heading: '把一次五倍的分歧定位到一个机制上', items: [
      '先核对方程真正预测的那个量：实测的重传（retry）比例对预测的碰撞概率。两者吻合，竞争就出局；两者不合，才回去查接入规则。',
      '再确认这两个数说的是同一件事：接入点的“错失”计数与重传计数相等，说明没有哪一帧被捕获救回，于是重传比例就是碰撞比例。',
      '把实际发出的帧按数据速率分组，数一数各有多少。一张直方图会立刻告诉你，发送端是不是根本没在用它买得起的那一级。',
      '算出实测的平均帧长：把所有数据帧（data frame）的空口时间（airtime）加起来，除以帧数。这十秒里是 1723.7 µs，而模型假设的是 248。',
      '只把 T_s 与 T_c 里的帧长换成这个实测值，其余三项——短帧间间隔（SIFS）、确认帧（ACK）、分布式帧间间隔（DIFS）——一项都不动，再解一次不动点。',
      '把新的预测和实测放在一起：5.547 对 5.534 Mb/s。差距落到千分之二，说明缺掉的那五分之四吞吐，全部记在“一帧变长了”这一件事上。',
    ] },
    { heading: '这不是仿真器的毛病', text: '把撞车读成衰落的速率控制，是真实设备的普遍行为，也正是碰撞感知速率自适应这一路方案被发明出来要治的东西：CARA 在降档前先用一个请求发送帧（RTS）探一探，另一些方案改用短窗口的丢失率而不是“连续失败计数”。这里两者都没有建模；近处这次仿真的意义，就是让你看见它们为什么存在。' },
  ],
  deeper: [
    { heading: '为什么这个回路会自己加速', text: '降一级，帧就长一截；帧长一截，两台站点同时在空中的时间就多一截；重叠多一截，失败多一次，于是再降一级。圆弧上没有这个回路，因为最慢的一级之下再无可降——上一课的场景之所以把每台站点放得那么远、发得那么轻，就是为了掐断它。这也说明：一个模型的假设不是“大致成立”就够了，它要么被布置成真，要么就要被点名。' },
    { heading: '为什么 1.1% 比 67.7% 更能说明问题', text: '如果速率控制只是偶尔失手，你会看到一条以最快那一级为主、偶有跌落的分布。这里正相反：最快的一级几乎没被用过。这说明发送端不是在“探索”，而是长期困在下面——判据是分布的形状，不是某一个百分位。' },
    { heading: '把重新定价和拟合分清楚', text: '拟合会引入一个自由参数，然后挑一个让两条曲线重合的值；你得到的吻合，等于你放进去的自由度。重新定价不引入任何参数：T_s 本来就需要一个帧长，而模型拿的是一个错的。把测量提供的那个数喂回去，剩下的 0.24% 才是真正的残差。这两件事的区别，就是这门课与“调一个常数”的区别。' },
  ],
  sources: [
    '速率选择算法不是标准规定的：IEEE Std 802.11-2024 把速率交给实现，所以这里降档的具体规则是本仿真器的模型取值，与“自动速率回退”那一课讲的同一套。',
    '一次交互的四项——帧、短帧间间隔、确认帧与分布式帧间间隔——见 §10.3.4 与 §10.7.6 的控制回应速率规则；重传前的等待从 ACK 超时结束时开始计，见 §10.3.2.9。',
    '15 dBm 的近处场景、种子 7、十秒采样窗口，以及上面每一个计数与平均值，都可由场景自己的种子复现。碰撞感知速率方案是 CARA（Kim 等，INFOCOM 2006）与 RRAA（Wong 等，MobiCom 2006）。',
  ],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: bianchiVsSimVariants,
  jumps: bianchiVsSimJumps,
  observe: [
    '绿色色块的长度一直在变：最快那一级 248 µs，最慢那一级 2064 µs。切到圆弧变体，每个色块就都一样长了。',
    '把整条绿色泳道读一遍：最快那一级的短色块只在开头附近出现。第 7.661 ms 上出现第一帧降了档的，往后就再没长时间爬回去过。',
  ],
  tryThis: [
    '把基础场景和「n = 5 在圆弧上」各跑十秒，把四个数并排放：碰撞 26.17% 对 25.84%，吞吐 5.534 对 4.717 Mb/s。近处更快的链路，反而交付得只多一点——把这句话写成一行结论。',
    '自己动手重新定价一次：从日志里取出所有数据帧的空口时间之和与帧数，算出 1723.7 µs，把它代进 T_s 与 T_c，再解一次不动点。你应该得到 5.547 Mb/s，而不是 29.52。',
  ],
  quiz: [
    {
      q: '近处实跑只交付了预测的约五分之一。哪一项测量最快能定位原因？',
      options: [
        '有多少帧最终被放弃了',
        '实际发出的帧在各数据速率上的分布',
        '各站点的队列（queue）排到多深',
      ],
      answer: 1,
      explain: '实测的碰撞比例已经和预测吻合，所以竞争不是嫌疑人。速率分布用一张直方图就点出了机制：只有 1.1% 的帧用上了链路的上限。',
    },
    {
      q: '把 T_s 里的帧长换成实测的 1723.7 µs，预测就落到 5.547 Mb/s。为什么这不算“调参数”？',
      options: [
        '因为差距还剩 0.24%，没有完全重合',
        '因为帧长本来就是模型需要的输入，而它原先用的是一个错的值；没有新增任何自由度',
        '因为实测值总是比假设值更可信',
      ],
      answer: 1,
      explain: '拟合会引入一个自由参数去追曲线；这里没有新参数，只是把一个本该由测量提供的输入喂了回去。剩下的 0.24% 才是残差。',
    },
  ],
}
