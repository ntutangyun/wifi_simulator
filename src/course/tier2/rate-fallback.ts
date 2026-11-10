/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · How the sender climbs and falls.
 *
 * The second half of the rate-control split (plan ruling 2): the fallback rule
 * this simulator follows, how lopsided it is, and where the failures that drive
 * it actually come from. `rate` is the first half.
 *
 * **Splits** in the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M9): this
 * half is the rule — 两次失败降一级，十次成功升一级 — and `rate-cost` is the bill
 * an excursion runs up. What moved out with the bill: 「账单落在邻居头上」, the
 * 20.2 %/29.7 % arithmetic, the freeze table, and 「这笔税，一句话说清」 (which
 * printed the same three figures the paragraph above it had just printed, §5.3).
 * What arrived from `rate` (§5.1.3): the ARF rule itself, whose duplicate that
 * lesson's `steps` block used to be.
 *
 * It reuses `rate`'s own builder with no variant, so `rate-fallback` records
 * the same timeline and its line in tests/fixtures/lesson-hashes.json is a copy
 * of `rate`'s. Every number quoted below is pinned in
 * tests/course/rate-fallback.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, firstData, firstRetry, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

/**
 * This run's first excursion, to scale: the far station's attempts 190 to 204
 * (counting from one), drawn from the start of the fourth-last frame that was
 * still at the ceiling. Every span is a `TX_START` of the base run, taken
 * relative to the one at 176.1974 ms; the two 'muted' ones are the pair that
 * went unanswered, and the rung lane underneath is when the working rung was 2,
 * 1 and 2 again.
 *
 * The gaps are real: they are the near station's own frames and the waiting
 * between them, which is why fifteen frames of 524–768.8 µs span 15.9 ms.
 *
 * It replaces nothing in prose — it replaces the reader's need to take the
 * worked table on trust. The table says two failures cost a rung and ten
 * successes buy it back; the figure is that sentence drawn from the records, and
 * the one thing it adds is how long the climb takes compared with the fall.
 */
export function fallbackExcursionTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '远端站点', spans: [
        { fromUs: 0, toUs: 524 },
        { fromUs: 890.2, toUs: 1414.2 },
        { fromUs: 1541.2, toUs: 2065.2, label: '这里连续丢失两帧', tone: 'muted' },
        { fromUs: 2669, toUs: 3193, tone: 'muted' },
        { fromUs: 4108, toUs: 4876.8, tone: 'accent' },
        { fromUs: 5721.4, toUs: 6490.2, tone: 'accent' },
        { fromUs: 6599.2, toUs: 7368, tone: 'accent' },
        { fromUs: 7797.2, toUs: 8566, tone: 'accent' },
        { fromUs: 8657, toUs: 9425.8, tone: 'accent' },
        { fromUs: 9774, toUs: 10542.8, tone: 'accent' },
        { fromUs: 10990, toUs: 11758.8, tone: 'accent' },
        { fromUs: 11849.8, toUs: 12618.6, tone: 'accent' },
        { fromUs: 12763.6, toUs: 13532.4, tone: 'accent' },
        { fromUs: 14359, toUs: 15127.8, tone: 'accent' },
        { fromUs: 15335.8, toUs: 15859.8 },
      ] },
      { label: '级别', spans: [
        { fromUs: 0, toUs: 4108, label: 'MCS 2' },
        { fromUs: 4108, toUs: 15335.8, label: 'MCS 1' },
        { fromUs: 15335.8, toUs: 15859.8, label: 'MCS 2' },
      ] },
    ],
    axis: { fromUs: 0, toUs: 16000, ticks: [0, 4000, 8000, 12000], unit: 'µs（0 为跌落前那一帧的起点）' },
  }
}

export const rateFallback: Lesson = {
  id: 'rate-fallback',
  module: 8,
  title: '速率回退——发送端如何降级、如何恢复',
  why: '一台只知道“有没有收到答复”的发送端，仍然必须决定何时放弃当前一级、何时改用更高的一级。教科书通常从这样一条规则讲起：降级要快，几帧没有答复就降级；升级要慢，要连续成功很多次才升回去。这种不对称是有意的：降一级只损失一些速度，而升错一级会使整帧都解不出来。本仿真器运行的就是这样一条规则：连续两帧没有收到答复就降一级，连续十帧收到答复才升一级，中间丢一帧计数就清零。所以一次跌落最快也要十帧才能回到上限，回升途中再丢一帧就会持续更久；而且每次只调整一级，从不跳级。使这台站点（STA）降到上限以下的不是信号变弱，而是碰撞：两台站点的退避（backoff）计数器在同一个时隙（slot time）减到零、同时开始发送，在接入点（access point, AP）处较强的近端那一帧被解出，丢失的只有远端那一帧。帧变慢、变长，也不会使它丢得更多：三个级别上的丢帧比例几乎相同，因为其他站点的退避计数器在它发帧期间冻结，一次失败在两帧发出之前就已确定。设想中「越慢越丢、越丢越慢」的循环并不存在；决定级别降到多低的是同时竞争的站点有几台，而不是它所在的位置。',
  outcomes: [
    '手工推演一遍仿真器的回退规则，说出下一帧会使用哪一级',
    '说明为什么降级很容易，而恢复很慢',
    '说出本场景中一次失败的实际原因，并说明它与帧长无关',
  ],
  terms: [
    { term: 'ARF', plain: '自动速率回退：本仿真器遵循的那条简单规则——连续两次失败降一级，连续十次成功升一级' },
    { term: 'excursion', plain: '跌落：一段以低于上限的级别发送的帧，从降级那一刻起，到回到上限为止' },
  ],
  needs: ['rate', 'anomaly'],
  picture: [
    { kind: 'steps', heading: '本仿真器遵循的规则（从发送端的角度）', items: [
      '从上限开始发送——上限就是上一课计算出的那一级调制与编码方式（modulation and coding scheme, MCS）。答复应当在帧结束后 45 µs 内到达；到时仍未收到，这次尝试即判为失败。',
      '一次失败会把成功计数清零，并把失败计数记为 1。这一帧原样重发，级别不变——单独丢一帧不会改变级别。',
      '连续第二次失败时，级别降一级，失败计数随即归零重新开始。此后的帧更长。',
      '每收到一次答复，都把失败计数清零，成功计数加一。连续九次成功还不会升级；到第十次才升一级，且绝不超过上限，随后计数归零重新开始。',
      '回升途中任何一次失败都会使成功计数清零。于是发送端“两次降一级、十次升一级”：降级很容易，升级很慢。',
    ] },
    { heading: '两次降级，十次升级', text: '这条规则就是 ARF，选用它是因为它的每一步都能在时间轴上看清楚。注意它的不对称程度：两次失败就降一级，而要回到原来那一级，必须连续成功十次，中间不能有一次失败。这一长段低速帧会让房间里其他站点付出多少代价，是下一课的内容。' },
    { kind: 'watch', jump: 1, heading: '在时间轴上观察', text: '载入仿真，跳到第一帧没有收到答复的位置，然后沿远端站点的泳道向后观察：找到连续的第二次失败，可以看到它之后的方块明显变长；再数一数，要经过多少帧方块才重新变短。' },
    { heading: '失败的来源', text: '这里几乎每一次没有收到答复，根源都是一次碰撞：两个退避（backoff）计数器在同一个时隙（slot time）减到零，两台站点同时开始发送。接下来起作用的是捕获效应（capture effect）：接收机守住它先锁定的那个前导码（preamble），只有遇到明显更强的前导码时才转而与后者同步。在接入点（AP）处，近端站点的信号强得多，因此它的帧被解出并得到答复，失败的只有远端那一帧。这条时间轴上没有任何碰撞标记，因为接入点那边没有任何一次接收失败。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '本轮第一次跌落，按记录等比例绘制',
      spec: fallbackExcursionTiming(),
      caption: '远端站点在上限上连续两帧没有收到答复，下一帧就降到 MCS 1：每帧从 524.0 µs 变为 768.8 µs。此后十帧全部收到答复，它才回到上限——两帧失败降掉的一级，要连续成功十帧才能恢复。中间的空隙是近端站点的帧和等待时间。',
    },
    { kind: 'table', heading: '远端站点的三秒：尝试次数与其中的失败次数', head: [
      '级别', '尝试次数',
      '失败次数', '每次尝试的失败率',
    ], rows: [
      ['MCS 2——它的上限', '2,396', '266', '11.1%'],
      ['MCS 1', '517', '61', '11.8%'],
      ['MCS 0——最低一级', '90', '10', '11.1%'],
    ] },
    { kind: 'table', heading: '同样这三秒内，以低于上限的级别发送的情况', head: [
      '项目', '数值',
    ], rows: [
      ['降到上限以下的次数', '25'],
      ['其中一直降到最低一级的', '6'],
      ['这六次各持续了多少帧', '10, 10, 10, 13, 19, 28'],
      ['规则允许的最短回升', '10 帧'],
    ] },
    { kind: 'table', heading: '一次降到最低一级的逐步过程', head: [
      '发生了什么', '之后的级别', '此时每帧时长',
    ], rows: [
      ['在上限上，每帧都收到答复', 'MCS 2', '524.0 µs'],
      ['连续两次尝试没有答复', 'MCS 1', '768.8 µs'],
      ['再连续两次没有答复', 'MCS 0', '1,476.0 µs'],
      ['连续十次收到答复', 'MCS 1', '768.8 µs'],
      ['再连续十次收到答复', 'MCS 2', '524.0 µs'],
    ] },
  ],
  deeper: [
    { heading: '并不存在的那个死亡螺旋', text: '人们很容易把这个回路的因果反过来设想：帧发得越慢，在空口上停留得越久，似乎越容易遭遇碰撞，于是丢得更多、发得更慢。但实测表明，这个螺旋并不存在。每次尝试的失败率在三个级别上几乎相同——上限上 11.1%，MCS 1 上 11.8%，MCS 0 上 11.1%——而最长的那些帧并不是失败最多的。原因是退避那一课讲过的冻结规则：退避计数器在其他站点发帧期间并不递减。介质一变忙它就暂停，介质空闲后再从同一个数值继续——这段仿真里近端站点的 2,666 次冻结，无一例外都以冻结前的数值恢复。所以更长的帧并不会给对方的计数器更多时间减到零，而是根本不给它递减的时间。决定一次失败的，是两个计数器会不会在同一个时隙减到零，而这在两帧发出之前就已确定。（有一个例外恰好印证了这条规则，它来自引擎而不是标准：两帧确实同时开始发送时，近端站点根本没有检测到远端的前导码——那一刻它自己的发射机正在发送。于是它的计数器照常在远端那一帧期间递减，甚至在那一帧中途发出第二帧；但远端那一帧在两者同时开始发送的那一刻就已经失败了，所以并没有额外的丢失。另外，MCS 0 上的九十次尝试样本太少，看不出趋势；关键在于，螺旋所需要的那种趋势，数据里根本没有。）' },
    { heading: '失败在时间轴上的表现', text: '这三秒内远端站点有 337 次尝试失败，而它们在屏幕上的表现并不相同。其中 254 次以一条 ACK 超时记录结束：应到的答复没有到达，等待时间到期。另外 83 次发生在其他站点某一帧的末尾——答复应到达时，这台站点正在接收那一帧；它接收完那一帧，发现其中没有给自己的答复，于是重传。两种情况都恰好调用一次 `onFailure`，所以上面那条规则只有把两种情况都计入，才能逐帧准确地复现整段仿真。' },
    { heading: '真实产品中的驱动采用什么做法', text: '没有任何量产驱动在使用这条规则。它们会在最近若干次尝试构成的滑动窗口上估计丢包率，再选择期望吞吐量最高的那一级——这样可以一次跳过好几级，而不必“十次成功升一级”，也能对最近没有尝试过的级别做出权衡。上面那几步应理解为本仿真器的规则，而不是你的笔记本实际采用的做法。' },
  ],
  limits: [
    { kind: 'out-of-scope', text: '本课讲的机制，在它自己的场景里缺少本应存在的那个触发因素：链路电平由几何位置与墙一次性确定，整段三秒保持不变，所以这里 337 次失败没有一次来自链路变差，全部来自碰撞与捕获效应。要观察它的典型作用，须在编辑器的「时变链路（衰落）」一节勾选「开启衰落」——链路电平此后围绕自身均值起伏，慢变的一层是对数正态阴影（默认 σ 4 dB、相干时间 100 ms，按相干区间更换取值），快变的一层逐帧变化（默认瑞利）。启用之后失败会成串出现，「连续两次」这条规则才真正发挥作用。', until: 'fading' },
    { kind: 'unmodelled', text: '即便启用了衰落，起作用的也只有这条规则：上限仍然依据静态链路表的平均电平，衰落完全不参与选级（simulation.ts 的 mcsForPeer）。发送端选级时那一帧尚不存在，所以这是有意的设计；但其后果是本仿真器里的发送端只能在帧已经丢失之后才做出反应。真实设备依据每帧返回的信噪比估计，提前避开一段深衰落，这种「先检测、再规避」的行为在这里不会发生。' },
    { kind: 'model-value', text: '「两次」和「十次」是引擎里的两个常数：src/engine/rate.ts 的 FAILURES_TO_STEP_DOWN = 2 与 SUCCESSES_TO_STEP_UP = 10。标准把速率选择整个留给实现者，所以这两个数不来自任何条款。本课的每一个测量值都取决于它们——25 次跌落、其中 6 次降到最低一级、规则允许的最短回升是十帧——换成别的数，这些数字全都要重新计算。' },
    { kind: 'unmodelled', text: '控制器只有这两个计数，没有其他状态：RateControl 的全部状态就是 mcs、ceiling、failures、successes 四个字段，没有随机性、没有探测帧、没有丢包率窗口，也不对「最近没有尝试过的那一级」做任何权衡。还有一个不明显的后果：上限本身回升时并不会同时提高当前级别，工作级别仍须逐级上升、每级连续成功十次。真实驱动在滑动窗口上估计丢包率，然后直接跳到期望吞吐量最高的那一级，可以一次跨越好几级。' },
  ],
  sources: [
    '自动速率回退是 Kamerman 与 Monteban 1997 年 WaveLAN-II 论文里的教科书算法，并非 IEEE Std 802.11-2024 定义的任何东西：标准把速率选择完全留给实现者。“两次降一级、十次升一级”这两个门限是本仿真器的模型取值，这样选取是为了让每一步都能在时间轴上观察到。',
    '“介质忙时冻结”见 §10.23.2.4：介质被判为忙时退避计数器挂起，恢复时沿用它原来的值。远端站点判定一次尝试失败前等待的 45 µs 是本仿真器的 ACK 超时，属于模型取值，按 SIFS 加上一个 ACK 的时长确定。',
    '捕获效应出自本仿真器的接收机模型而非某个条款：一段在无干扰条件下检测到的前导，只要整帧期间比值始终满足该级要求就会被解出，而在 40 dB 余量下它始终满足。标准给出的是各级灵敏度（第 36 章），并没有规定接收机遇到两帧重叠时必须如何处理。',
  ],
  scenario: () => rateScenario(),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('第一次重传', firstRetry),
  ],
  observe: [
    '这段仿真中远端站点六次降到最低一级。十帧是规则允许的最快回升，六次里有三次达到了；其余三次分别持续 13、19、28 帧，因为回升途中又丢了一帧，使计数清零。',
    '每一次时长变化都只相差一级：远端站点无论降级还是恢复，都从不跳级。',
    '这条时间轴上没有任何碰撞标记，而近端站点三秒内一帧未丢：4,010 帧，没有一次 ACK 超时（ACK timeout）。由于捕获效应，每一次碰撞中被正确接收的都是它的帧。',
  ],
  tryThis: [
    '点击“在编辑器中打开”，在近端站点旁边再添加一台饱和上传的站点。远端站点以最低一级发送的帧，占比从 3.0% 变为 26.3%——将近十倍，而改动只是多了一台发送站点。',
    '再把这台新站点移到别处，结果只会更差而不会更好：这里试过的另外三个位置都落在 36% 到 43% 之间。使级别降到最低的是同时竞争的站点数，而不是几何位置。',
  ],
  quiz: [
    {
      q: '远端站点的信号没有变化，但它的级别降了两级。发生了什么？',
      options: [
        '上限本身降了两级',
        '连续四次尝试失败——第二次失败时降一级，第四次失败时又降一级',
        '接入点为了省电，要求它降低速率',
      ],
      answer: 1,
      explain: '连续两次失败降一级，而基于信号的上限本身不会改变。降两级，就是两组连续失败，共四次。',
    },
    {
      q: '远端站点在最低一级的帧，长度几乎是它 MCS 1 帧的两倍。这两者中，哪一种每次尝试更容易失败？',
      options: [
        '最低一级的——它们在空口上停留得更久，期间会有更多退避计数器来得及减到零',
        '如果一定要比较，是 MCS 1 的：11.8% 对 11.1%。决定每次尝试失败率的不是帧长',
        '两者完全一样——失败只取决于有多少台站点',
      ],
      answer: 1,
      explain: '表中的数几乎相同：11.1%、11.8%、11.1%。这里一次尝试之所以失败，是因为两个退避计数器在同一时隙减到零，而捕获效应只让较强的那一帧被解出；这在两帧发出之前就已确定，与帧的最终长度无关。',
    },
  ],
}
