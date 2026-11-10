/**
 * Wi-Fi Tier 1 · M6 · The prediction against the run — first half.
 *
 * Re-paced 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2, M6). This lesson keeps the arc: how the two columns are made, how closely
 * they agree, the three smaller differences that explain the sign, and the
 * residual that is reported rather than fitted. The close-in run — where the
 * prediction misses by a factor of five and the culprit is rate control, not
 * contention — is the second half, `rate-vs-model.ts`, which loads this scene and
 * these variants, so the two ids replay to the same recorded hashes.
 *
 * ONE FINDING CORRECTED HERE, and it is why the split moved more prose than the
 * plan expected. Both halves of this scene put every station at the SAME distance
 * from the access point (the arc at 3 m, the close-in variant on a 1 m circle), so
 * both arrive at exactly equal levels and CAPTURE NEVER HAPPENS IN EITHER. The old
 * lesson said the opposite — "close in, two overlapping frames rarely arrive at the
 * same strength, and the access point sometimes locks the louder one" — and a 10 s
 * run refutes it: the access point's RX_MISS count and the RETRY count are the same
 * number, exactly, in all three scenarios (1635 close in, 1370 on the arc at n = 5,
 * 2840 at n = 20). What that buys is a better claim than the one it replaces: on
 * this scene the retry counter IS the collision counter, which is what makes the
 * comparison legitimate at all. Capture itself is taught where a run shows it —
 * `anomaly`'s near/far pair and the project's flat, both of which really do span
 * tens of decibels.
 *
 * The busy-slot experiment quoted under the slot clock is a one-off probe, not
 * something the engine does: it patches WifiMac.prototype.onIfsEndAc to decrement
 * the backoff across each busy period (Bianchi's convention) and re-measures
 * n = 20.
 *
 * Numbers are pinned by tests/course/bianchi-vs-sim.test.ts. The scenarios are
 * unchanged, so the recorded timeline hashes stay identical.
 */
import { J, firstCollision, firstData, firstRetry, type Lesson, type LessonVariant } from '../lessonKit'
import { bianchiScenario, nLabel } from './bianchi'

/**
 * The two variants both halves of this scene list, in this order. The second half
 * reuses this array rather than rebuilding it, so the two ids replay to the same
 * recorded timeline hashes, variant for variant.
 */
export const bianchiVsSimVariants: LessonVariant[] = [
  { label: 'n = 5 在圆弧上（速率固定为 6 Mb/s）', scenario: () => bianchiScenario(5) },
  { label: nLabel(20), scenario: () => bianchiScenario(20) },
]

/** The four jumps both halves offer over that same run. */
export const bianchiVsSimJumps = [
  J('第一个数据帧', firstData),
  J('第一次碰撞', firstCollision),
  J('第一次重传', firstRetry),
  J('第一次 CW 翻倍', (r) => r.type === 'CW_CHANGE' && r.cw > 15),
]

export const bianchiVsSim: Lesson = {
  id: 'bianchi-vs-sim',
  module: 5,
  title: '预测与实测的对照',
  why: '一个预测，只有在知道它从何处开始失效之后才真正有用。把理论计算的结果与实测结果并列，两者永远不会完全吻合——接下来如何处理，正是工程师与“只会套用表格的人”的区别。在圆弧上，每台站点（STA）到接入点（AP）的距离相同、每一帧的长度相同，接收端无法锁定任何一个重叠的帧，于是重传（retry）数恰好等于碰撞数，可以直接用来与预测比较。结果是：在没有任何拟合参数的情况下，碰撞比例都落在预测值的一成以内，吞吐量在百分之五以内；但从五台起，实测的碰撞总比预测少，偏差每次都在同一方向，所以是可以解释的。几个原因各有其量级：标准在其他站点发送时冻结等待中的计数器，而模型让它继续递减，二十台时这一条约占差距的一半；真实站点在碰撞之后各自需要等待的时间并不相同；一次碰撞比一次成功稍早结束，这一条对吞吐量的影响很小。加总之后，站点较多时仍有两个百分点左右无法解释，这就是残差；如实报告它本身就是一个结果，而调整一个常数使曲线重合则不是。两台那一行的偏差符号相反：只有一台竞争者时，模型对其余站点取平均的方法无法成立，站点少反而是难以准确预测的情形。',
  outcomes: [
    '把一次比较写成方法：使用哪一次运行、统计哪些记录、模型的输入从何而来',
    '先明确正在统计的量——这就是估计量——再核对它是否就是模型真正定义的那个量',
    '如实报告无法解释的那一部分——残差，而不是调整一个常数直到两条曲线重合',
  ],
  needs: ['bianchi', 'anomaly'],
  terms: [
    { term: 'capture', plain: '捕获效应（capture effect）：接收机一旦锁定某个前导码就保持锁定，只有遇到明显更强的前导码时才转而与之同步，于是较强的那一帧仍被正确接收' },
    { term: 'residual', plain: '计入已找到的所有原因之后，偏差中仍无法解释的那一部分' },
  ],
  picture: [
    { heading: '两个结果并列比较', text: '在圆弧上——每台站点（STA）到接入点（AP）的距离相同，每一帧的长度也相同——预测与实测吻合得相当好。这是刻意布置的结果：整个场景的目的就是使论文的每一条假设真正成立。只要改变其中一个条件，这种吻合就可能消失，而下一课改变的正是这个条件。' },
    { kind: 'watch', jump: 1, heading: '先切换到圆弧，再观察一次碰撞', text: '载入仿真之后先切换到「n = 5 在圆弧上」这个变体，再跳到第一次碰撞。每个绿色色块的长度都相同，而接入点一帧也没有锁定——这就是两条假设同时成立时的表现。' },
    { heading: '这里没有捕获效应，因此两个计数相等', text: '重传（retry）统计的是丢失的帧，重叠统计的是发生碰撞的帧。两者只在接收端无法锁定任何一帧时才相等，而圆弧上正是如此：五台站点的到达强度完全相同，一次重叠会使每一帧都接收失败，于是接入点的每一次错失都恰好对应一次重传。在各站点强弱悬殊的房子里则不然——较强的那一帧仍被正确接收，这就是捕获效应。' },
    { heading: '同一次事件，三种不同的等待', text: '论文假设所有站点在同一时刻重新开始竞争，真实的站点并非如此：碰撞的两台各自等待期限到期；锁定了重叠帧之一却未能正确解出的邻居，需要等待一段更长的时间——扩展帧间间隔（extended interframe space, EIFS）；什么也没有锁定的邻居只需等待分布式帧间间隔（DCF interframe space, DIFS）。那条链中没有这种状态。' },
    { heading: '如何处理剩余的偏差', text: '逐一列出每个原因，用模型自身的单位定量，核对符号——然后说明还有多少无法解释。这一部分就是残差，如实报告它本身就是一个结果；而把某个常数调整到使曲线重合则不是。' },
  ],
  numbers: [
    { kind: 'steps', heading: '两列数字的得出方法', items: [
      '载入某一站点数下的圆弧场景，使用它自带的种子，运行满十秒仿真时间。下面统计的一切都发生在这个时间窗口内，没有任何量是多次重复运行后取平均的。',
      '每一条携带数据帧（data frame）的 TX_START 记录计为一次尝试；每一条重传记录（RETRY）计为一次失败——媒体访问控制（MAC）在一次尝试未收到应答时写入这条记录。后者除以前者即为实测碰撞率。',
      '每回复一个确认帧（ACK）计为一次成功交付。乘以一个载荷（payload）的 12,000 比特，再除以这十秒，就是实测吞吐量。',
      '模型的输入一律取自场景，绝不取自实测：n 是圆弧上饱和站点的数量；W = 16、m = 6、L = 7 取自引擎；一次成功与一次碰撞的代价按 6 Mb/s 计算——这条圆弧只允许这一种速率。',
      '把两列数字并列，按站点数逐行相减。此后两边都不再调整。',
      '写明这套方法无法处理的情况：一旦捕获效应起作用，重传数就不再等于重叠数（圆弧上不会发生，换一个户型就会）；换一个种子，实测值会变化零点几个百分点；而圆弧是通过布置使论文的假设成立，并不是在检验这些假设。',
    ] },
    { kind: 'table', heading: '圆弧场景：预测与十秒实测的对照', head: [
      'n', '碰撞，预测', '碰撞，实测',
      '吞吐，预测', '吞吐，实测',
    ], rows: [
      ['2', '10.46 %', '11.20 %', '5.169', '5.136 Mb/s'],
      ['5', '27.22 %', '25.84 %', '4.679', '4.717 Mb/s'],
      ['10', '38.92 %', '35.08 %', '4.275', '4.421 Mb/s'],
      ['20', '49.59 %', '45.83 %', '3.857', '4.027 Mb/s'],
    ] },
    { heading: '很接近，但偏差每次都在同一方向', text: '每个碰撞比例都落在预测值的 10% 以内，每个吞吐量都在 5% 以内，全程没有任何拟合参数。但从五台站点起，实测的碰撞总是少于预测，只有两台那一行的偏差符号相反。既然偏差是系统性的，就是可以解释的。' },
    { kind: 'list', heading: '较小的差异及各自的量级', items: [
      '时隙（slot time）时钟。链让等待中的计数器在忙周期内继续减一，而标准规定将其冻结。改为继续减一后，二十台站点的实测值从 45.83% 升高到 47.9% 左右——约为它与 49.59% 之间差距的一半。',
      '重新开始竞争的时刻。五台站点的圆弧记录了 1029 次这种更长的等待，每一次都使某个邻居比其他站点多 60 µs 不能参与竞争。',
      '碰撞的代价。这里一次碰撞比一次成功早结束 15 µs，约占一次交互的 0.7%，二十台时对吞吐量的影响为 0.2%。改用论文自己的取值，预测反而向另一方向偏移 0.6%。',
    ] },
    { heading: '残差', text: '把已列出的原因加总，站点较多时仍有大约两个百分点的碰撞率无法解释。应当如实说明这一点。这个预测依然很有价值：两个方程、零个拟合参数，站点数变化十倍，吞吐量的预测误差都在几个百分点以内。' },
  ],
  deeper: [
    { heading: '为什么站点少反而难以预测', text: '两台站点就是偏差符号相反的那一行：实测 11.20%，预测 10.46%。链把其余站点视为在每个时隙相互独立、发送概率相同的发送源，而只有一台竞争站点时根本无法取平均——某台站点竞争成功一轮之后，对方计数器上剩余的值无论如何都不是一次全新的均匀随机选取。精度随站点数增加而提高，这与“小网络更简单”的直觉恰好相反。' },
    { heading: '这个模型无法回答的问题', text: '碰撞概率是整个网络共用的一个数。在二十台站点的圆弧仿真中，各站点自己的碰撞率分布在 42.9% 到 52.1% 之间，而这没有任何问题：那只是同一个共享随机过程在有限样本上的离散。但公平性、时延长尾与饿死现象，根本不在这个模型的描述范围之内；而用一个模型去回答它本不能回答的问题，是本课中代价最高的错误。' },
    { heading: '在模型的极端情形下检验它', text: '为圆弧上的五台站点全部加载“根本没有窗口”的篡改驱动，方程的结论是：每台站点在每个时隙都发送，每次尝试都碰撞，吞吐量为零。实测结果正是如此：23,335 次尝试，其中 23,330 次碰撞，没有一个应答，3,330 帧被放弃。只为一台加载作弊驱动，它就占去 4,639 次尝试中的 4,634 次，四台遵守规则的站点十秒内一共只发出五帧，而信道吞吐量仍达到 5.557 Mb/s——正是单站点的上限：一个载荷除以一次无碰撞交互的时长。' },
  ],
  limits: [
    { kind: 'model-value', text: '「实测」那一列是一次十秒、单一种子的运行。引擎是确定性的，同一个场景每次给出同一个数，所以这里谈不上置信区间：换成种子 8 或 12345 会得到 25.53% 与 25.71%。可复现不等于精确——一份真实测量要多次重复才能给出一个区间，而本课给出的是一个点值。' },
    { kind: 'unmodelled', text: '用来与预测比较的「碰撞」，统计的是引擎的 RETRY 记录，而引擎判定一次失败只有一条依据：期限内没有开始接收（mac.ts 的 onRespTimeout）。接收端实际收到了多少错误比特、帧校验序列能否通过，引擎都不考虑——校验和从不实际计算。因此两个计数相等这一点，有一半是模型的定义所致，而不是纯粹的测量结果。' },
    { kind: 'unmodelled', text: '本课列出的三条差异都属于时间方面，而引擎在空间方面比真实空口理想得多：没有传播时延，没有本网络之外的任何干扰源（channel.ts 只为共享频段的 UWB 建立了一条通路），电平也不随时间变化。真实的十秒测量中，微波炉、蓝牙与邻居的网络都会对残差有所贡献。这里的两个百分点，是在一个没有外部干扰的房间里测得的。' },
    { kind: 'out-of-scope', text: '引擎中没有「固定速率」这个开关：速率控制始终在运行，本课只能把站点放在速率已处于最低一级、无法再降的位置，才使速率保持不变（−20 dBm 的圆弧）。所以这种吻合只在这条圆弧上成立，移动两米就不再成立，而这正是下一课演示的内容。要在其他场景中做同样的比较，需要先设法把速率固定。' },
  ],
  sources: [
    '确认期限与重传前的等待见 IEEE Std 802.11-2024 §10.3.2.9（mac.ts 的 onRespTimeout）；忙周期内计数器冻结见 §10.23.2.4；接收失败后那段更长的等待是 EIFS，见 §10.3.2.3.7，这里是 94 µs，而 DIFS 是 34 µs。',
    '时隙时钟那个约 47.9% 的数字，来自一次一次性的探测实验：它修改 MAC，使退避在每个忙周期内也递减。这不是本仿真器的某种模式，也有意不由测试固定；引擎遵循的是标准。',
    '−20 dBm 的圆弧、种子 7、十秒采样，以及决定捕获与否的前导检测余量，都是本仿真器的模型取值。这条圆弧上每台站点到达强度相同，所以捕获在这里从不发生——能观察到捕获的是“性能异常”一课与第一阶段项目。',
  ],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: bianchiVsSimVariants,
  jumps: bianchiVsSimJumps,
  observe: [
    '在圆弧变体中，每个绿色色块都是同样的 2064 µs；碰撞之后查看接入点一侧，记录的是“错失”而不是“接收失败”——两个前导码（preamble）强度相同，都没有被锁定。十秒内 1370 次错失，恰好对应 1370 次重传。',
    '逐个查看那些等待色块：碰撞的两台仍在各自的期限内，一个邻居已经进入 EIFS，另一个只处于 DIFS。同一次事件，三种不同的等待。',
  ],
  tryThis: [
    '把 n = 20 的圆弧运行十秒，把实测的 45.83% 与预测的 49.59% 对照，再从那三条差异中找出方向：哪一条会使实测值偏低？',
    '在预测的极端情形下检验它。为圆弧上的五台站点都加载“没有窗口”的篡改驱动：实测在 23,335 次尝试中碰撞 23,330 次，没有送达任何帧，放弃 3,330 帧——与方程的结论一致。',
  ],
  quiz: [
    {
      q: '在这条圆弧上，为什么可以直接用“重传比例”与预测的碰撞概率比较？',
      options: [
        '因为一帧只有七次机会，误差可以忽略',
        '因为这里无法锁定任何一个重叠的帧，于是每一次重叠都恰好对应一次重传',
        '因为十秒的样本已经足够长',
      ],
      answer: 1,
      explain: '五台站点到达强度相同，捕获不会发生：十秒内接入点的 1370 次错失对应 1370 次重传。换一个各站点强弱悬殊的户型，这两个数立即不再相等。',
    },
    {
      q: '圆弧上五台及以上时，实测的碰撞比预测少。哪一项差异指向这个方向？',
      options: [
        '一帧尝试七次之后就被放弃',
        '标准在忙周期内冻结等待中的计数器，而链让它继续减一',
        '使同时开始的发送成为完全碰撞的那条前导码规则',
      ],
      answer: 1,
      explain: '重传上限（retry limit）使碰撞率升高而不是降低，而前导码规则恰恰使“无捕获”假设成立。冻结则使每台等待中的站点推迟一个时隙。',
    },
    {
      q: '还有几个百分点无法解释。专业的做法是什么？',
      options: [
        '调整一个常数，直到两条曲线重合',
        '如实报告残差，并列出已经解释的原因及其量级',
        '宣布仿真器有错，因为模型已经发表',
      ],
      answer: 1,
      explain: '拟合得到的常数会使这个预测失去唯一的价值。写明的残差是可复现的；修正因子不是，诉诸权威也不是。',
    },
  ],
}
