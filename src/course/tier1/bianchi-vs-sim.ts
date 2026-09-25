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
  { label: 'n = 5 在圆弧上（速率钉在 6 Mb/s）', scenario: () => bianchiScenario(5) },
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
  title: '预测对上实跑',
  why: '一个预测，只有在你知道它从哪里开始失效之后才真正有用。纸上的答案和实测并排放，永远不会严丝合缝——接下来你怎么做，正是工程师与“会用表格的人”的区别。这一课在圆弧上诚实地读一次分歧：两列数字怎么做出来、差在哪儿、每个原因有多大。',
  outcomes: [
    '把一次比较写成方法：哪一次跑、数哪些记录、模型的输入从哪里来',
    '核对你的估计量，是不是模型真正定义的那个量',
    '把解释不了的那一部分——残差——如实报出来，而不是调一个常数直到两条曲线重合',
  ],
  needs: ['bianchi', 'anomaly'],
  terms: [
    { term: 'capture', plain: '两帧重叠时，接收端锁住其中更强的那一帧，照样把它读了出来' },
    { term: 'residual', plain: '把你找到的每个原因都算进去之后，分歧里仍然解释不了的那一部分' },
  ],
  picture: [
    { heading: '两个答案，并排放', text: '在圆弧上——每台站点（STA）到接入点（AP）的距离相同，每一帧的长度也相同——预测与实跑吻合得相当好。这是刻意布置出来的：整个场景就是为了让论文的每一条假设真的成立。只要挪动其中一件事，这份吻合就可能消失，而下一课挪的正是那一件。' },
    { kind: 'watch', jump: 1, heading: '先切到圆弧，再看一次碰撞', text: '载入仿真之后先切到「n = 5 在圆弧上」这个变体，再跳到第一次碰撞。每个绿色色块都一样长，而接入点一帧也没锁住——这就是两条假设同时成立的样子。' },
    { heading: '这里没有捕获，于是两个计数是同一个数', text: '重传（retry）数的是丢掉的帧，重叠数的是撞在一起的帧。两者只在接收端谁也锁不住时才相等，而圆弧上正是如此：五台站点到达强度分毫不差，一次重叠把每一帧都毁掉，于是接入点每一次错失都恰好对应一次重传。强弱悬殊的房子里不是这样——较强的那一帧照样被解出来，这就是捕获。' },
    { heading: '一次事件，三只钟', text: '论文让所有人在同一瞬间重启，真实的站点不会：碰撞的两台各自等满期限；锁上了重叠帧之一却没读出来的邻居欠一段长惩罚等待——扩展帧间间隔（extended interframe space, EIFS）；什么也没锁上的邻居只欠分布式帧间间隔（DCF interframe space, DIFS）。那条链里没有这个状态。' },
    { heading: '剩下的那部分怎么办', text: '把每个原因点名，用模型自己的单位定量，核对符号——然后说出还有多少没算清。那一块就是残差，如实报出它本身就是一个结果；而把某个常数调到曲线重合不是。' },
  ],
  numbers: [
    { kind: 'steps', heading: '两列数字是怎么做出来的', items: [
      '载入某一个人数下的圆弧场景，用它自带的种子，跑满十秒仿真时间。下面数到的一切都发生在这扇窗口之内，没有任何量是多次重跑取平均的。',
      '每一条携带数据帧（data frame）的 TX_START 记录算一次尝试；每一条重传记录（RETRY）算一次相遇——媒体访问控制（MAC）在一次尝试没等到回答时写下它。后者除以前者即实测碰撞率。',
      '每发回一个确认帧（ACK）算一次成功交付。乘上一个载荷（payload）的 12,000 比特，再除以那十秒，就是实测吞吐。',
      '模型的输入一律取自场景，绝不取自实测：n 是圆弧上有几台饱和的站点；W = 16、m = 6、L = 7 取自引擎；一次成功与一次撞车的代价按 6 Mb/s 定价——这条圆弧只允许这一种速率。',
      '把两列数字并排放好，按人数逐行相减。之后两边都不再动。',
      '把这套方法管不了的事写下来：捕获一起作用，重传数就不再等于重叠数（圆弧上不会，换一户房子就会）；换一个种子，实测值会动上几分之一个百分点；而圆弧是把论文的假设布置成真，不是去检验它们。',
    ] },
    { kind: 'table', heading: '圆弧场景：预测对上十秒实跑', head: [
      'n', '碰撞，预测', '碰撞，实测',
      '吞吐，预测', '吞吐，实测',
    ], rows: [
      ['2', '10.46 %', '11.20 %', '5.169', '5.136 Mb/s'],
      ['5', '27.22 %', '25.84 %', '4.679', '4.717 Mb/s'],
      ['10', '38.92 %', '35.08 %', '4.275', '4.421 Mb/s'],
      ['20', '49.59 %', '45.83 %', '3.857', '4.027 Mb/s'],
    ] },
    { heading: '很接近，但每次都错向同一边', text: '每个碰撞数都落在预测的 10% 以内，每个吞吐都在 5% 以内，全程没有任何拟合参数。但从五台站点往上，实跑的碰撞总是少于预测，只有两台那一行符号反了过来。既然是系统性的，就是可以解释的。' },
    { kind: 'list', heading: '较小的差异，各值多少', items: [
      '时隙（slot time）时钟。链会让等待中的计数器在忙周期上继续减一，而标准是把它冻住。改成继续减一，二十台站点的实测值就从 45.83% 升到 47.9% 左右——约是它与 49.59% 之间差距的一半。',
      '重启时刻。五台站点的圆弧记录了 1029 次长惩罚等待，每一次都让某个邻居比其他人多被挡在竞争之外 60 µs。',
      '撞车的代价。这里一次碰撞比一次成功早结束 15 µs，约占一次交互的 0.7%，二十台时值 0.2% 的吞吐。改用论文自己的取值，预测反而往另一边挪 0.6%。',
    ] },
    { heading: '残差', text: '把点过名的原因加总，人多时仍有大约两个百分点的碰撞率没有着落。就这么说出来。这个预测依然物有所值：两个方程、零个拟合参数，人数变化十倍，吞吐都预测到了几个百分点以内。' },
  ],
  deeper: [
    { heading: '为什么人少反而是难的情形', text: '两台站点就是那个符号反转的行：实测 11.20%，预测 10.46%。链把其余站点当成每个时隙独立抛掷的硬币，而只有一个对手时根本无从平均——某台站点赢下一轮之后，对方计数器上剩下的数怎么看都不是一次全新的均匀抽签。精度随人群变大而变好，这与“小网络更简单”的直觉恰好相反。' },
    { heading: '有些问题不能问这个模型', text: '碰撞概率是整个网络一个数。在二十台站点的圆弧仿真里，各站点自己的碰撞率从 42.9% 铺到 52.1%，而这没有任何问题：那只是同一场共享抽奖在有限样本上的离散。但公平性、时延长尾与饿死现象，根本不在这个模型的词汇表里；而一个模型悄悄回答了你没问它的问题，是本课中代价最高的错误。' },
    { heading: '在模型的极端角落考它', text: '给圆弧上五台站点全挂上“根本没有窗口”的篡改驱动，方程会说：每台站点在每个时隙都发送，每次尝试都碰撞，吞吐为零。实跑给出的正是如此：23,335 次尝试，其中 23,330 次碰撞，一个回答也没有，3,330 帧被放弃。只给一台挂上作弊，它就拿走 4,639 次尝试中的 4,634 次，四台守规矩的站点十秒里一共只发出五帧，而信道仍跑出 5.557 Mb/s——正是单站点的天花板：一个载荷除以一次干净交互的代价。' },
  ],
  sources: [
    '确认期限与重传前的等待见 IEEE Std 802.11-2024 §10.3.2.9（mac.ts 的 onRespTimeout）；忙周期内计数器冻结见 §10.23.2.4；接收失败后的长惩罚等待是 EIFS，见 §10.3.2.3.7，这里是 94 µs，而 DIFS 是 34 µs。',
    '时隙时钟那个约 47.9% 的数字，来自一次一次性探针：它给 MAC 打补丁，让退避在每个忙周期上递减。这不是本仿真器的某种模式，也有意不被测试钉住；引擎遵循的是标准。',
    '−20 dBm 的圆弧、种子 7、十秒采样，以及决定捕获与否的前导检测余量，都是本仿真器的模型取值。这条圆弧上每台站点到达强度相同，所以捕获在这里从不发生——它被看见的地方是“性能异常”与第一阶段项目。',
  ],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: bianchiVsSimVariants,
  jumps: bianchiVsSimJumps,
  observe: [
    '在圆弧变体里，每个绿色色块都是同样的 2064 µs；碰撞过后看接入点那一侧，记下的是“错失”而不是“接收失败”——两个前导码（preamble）强度相同，哪个都没被锁住。十秒里 1370 次错失，恰好对应 1370 次重传。',
    '逐步向前翻那些等待色块：碰撞的两台还在各自的期限里，一个邻居已经进入 EIFS，另一个只在 DIFS。一次事件，三只钟。',
  ],
  tryThis: [
    '把 n = 20 的圆弧跑十秒，把实测的 45.83% 放到预测的 49.59% 旁边，再回到那三条差异里找方向：哪一条会把实测往下压？',
    '在预测的极端角落考它。给圆弧上五台站点都挂上“没有窗口”的篡改驱动：实跑在 23,335 次尝试里碰撞 23,330 次，什么也没送到，放弃 3,330 帧——与方程说的分毫不差。',
  ],
  quiz: [
    {
      q: '在这条圆弧上，为什么可以直接拿“重传比例”去对预测的碰撞概率？',
      options: [
        '因为一帧只有七次机会，误差可以忽略',
        '因为这里谁也锁不住重叠的帧，于是每一次重叠都恰好变成一次重传',
        '因为十秒的样本已经足够长',
      ],
      answer: 1,
      explain: '五台站点到达强度相同，捕获无从发生：十秒里接入点的 1370 次错失对应 1370 次重传。换一户强弱悬殊的房子，这两个数立刻分道扬镳。',
    },
    {
      q: '圆弧上五台及以上时，实跑的碰撞比预测少。哪一项差异指向这个方向？',
      options: [
        '一帧七次之后就被放弃',
        '标准在忙周期里把等待中的计数器冻住，而链会让它继续减一',
        '把同时起始变成干净碰撞的那条前导码规则',
      ],
      answer: 1,
      explain: '重传上限（retry limit）是把碰撞率往上推而不是往下压，而前导码规则恰恰让“无捕获”假设成立。冻结则让每台等待中的站点晚一个时隙。',
    },
    {
      q: '还剩几个百分点解释不了。专业的做法是什么？',
      options: [
        '调一个常数，直到两条曲线重合',
        '如实报告残差，并列出已经解释掉的原因及其量级',
        '宣布仿真器有错，因为模型是发表过的',
      ],
      answer: 1,
      explain: '拟合出来的常数会毁掉这个预测唯一的价值。写明的残差是可复现的；修正因子不是，诉诸权威也不是。',
    },
  ],
}
