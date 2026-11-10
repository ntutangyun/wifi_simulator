/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · NAV, the reservation a header carries.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M4): the
 * proposal keeps this lesson **whole** — one field, one timer, one procedure —
 * at about 1,300 characters, the longest allowance in the module. What changed
 * is what came off it:
 *
 *  - the promise image, which ran through the lesson four times
 *    (「耳朵告诉不了你的事」,「每一帧开头的那句承诺」,「耳朵守的是帧，承诺守的
 *    是间隙和回答」,「那句预告」): §5.2. The field has a name, and the name is
 *    Duration.
 *  - `deeper`'s 「为什么标签写的是一回事，色块代表的是另一回事」: §5.5 — that is
 *    how to read the UI, not how the network works.
 *  - the three-row 「把一段长长的冻结拆开」table, now the timing figure: the
 *    table's whole content was three lengths and their sum, which is what a
 *    figure drawn to scale says better (§5.4).
 *  - one `observe` line and one `tryThis`, each of which repeated another.
 *
 * Every number quoted below is pinned in tests/course/nav.test.ts. The scenario
 * builder is unchanged, so the recorded timeline hash stays identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstNav, J } from '../lessonKit'

/**
 * One long freeze, to scale, and the reservation sitting in the middle of it.
 * Every figure is a record of this lesson's base run: BACKOFF_FREEZE for Talker
 * A at 498 with value 3, B's TX_END at 746, the NAV_SET at 746 running to 790,
 * the IFS_START from 790 to 824, and the acknowledgement on the air from 762 to
 * 790.
 *
 * It replaces the three-row table that used to print 248 + 44 + 34 = 326: the
 * table's content was three lengths and a sum, and three lengths side by side
 * are what shows that the middle one is the only one the ear cannot account
 * for. The middle span is left unlabelled on purpose — 44 µs is already the
 * `Duration` lane's own label directly above it, and a second label there
 * cannot fit a 20-unit span without being pushed off the viewBox.
 * `nav.test.ts` reads each figure back out of this spec.
 */
export function navTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 498, toUs: 746, label: 'B 的数据帧' },
        { fromUs: 762, toUs: 790, label: 'ACK' },
      ] },
      { label: 'Duration', spans: [{ fromUs: 746, toUs: 790, label: '44 µs', tone: 'accent' }] },
      { label: 'A 等待的原因', spans: [
        { fromUs: 498, toUs: 746, label: '侦听为忙' },
        { fromUs: 746, toUs: 790, tone: 'muted' },
        { fromUs: 790, toUs: 824, label: 'DIFS' },
      ] },
    ],
    axis: { fromUs: 470, toUs: 840, ticks: [500, 600, 700, 800], unit: 'µs' },
  }
}

export const nav: Lesson = {
  id: 'nav',
  module: 3,
  title: 'NAV——用一个字段预约信道',
  why: '仅凭侦听，站点（station, STA）只能知道空口此刻是否忙。但一次帧交换中存在间隙——应答返回之前的那一小段停顿；而应答本身，还可能来自一台距离太远、根本收不到的设备。只依据自身侦听结果的站点，在这两处都会把信道判为空闲而开始发送，与正在进行的交互发生碰撞。因此每一帧的帧头（MAC header）里都有一个持续时间（Duration/ID）字段，写明这一帧结束之后本次交互还需要多长时间：数据帧（data frame）填写的是停顿加确认帧（acknowledgement, ACK）的时长，不包括它自身，因为它在空中时所有站点的侦听本来就报忙；确认帧填写零，表示交互到此结束。凡是完整解出这一帧的站点，即使不是接收方，都以“帧结束时刻加这个数”启动一个本地倒计时，叫网络分配向量（network allocation vector, NAV）；新算出的时刻只能把它推迟，不能把它提前。倒计时未到期，站点就把信道视为忙，正在进行的退避（backoff）计数冻结——这叫虚拟载波侦听（virtual carrier sense）。旁听站点的倒计时恰好在应答结束的时刻到期，每次都如此。所以一段较长的冻结由三段组成：邻居那一帧在空中，侦听报忙；它之后的停顿和应答由倒计时覆盖，停顿期间空口确实空闲，使站点不能发送的只有倒计时；最后是一个真正空闲的分布式帧间间隔（DCF interframe space, DIFS）。站点并不掌握时间表：冻结的时刻它不知道要等待多久，要等整帧解出之后，才得到一个“最早何时恢复”的下界。',
  outcomes: [
    '说明站点为自己的计时器设置的是什么值、取自哪些帧',
    '解释为什么仅靠侦听信道无法保护一次交互',
    '从数据帧（data frame）中读出这项预约，并用它所保护的应答来核对',
  ],
  needs: ['backoff'],
  terms: [
    { term: 'Duration', plain: '帧头前部的一个字段：这一帧之后本次交互还需要的时长' },
    { term: 'NAV', plain: '网络分配向量：站点本地维护的倒计时，未到期时信道视为忙' },
    { term: 'virtual carrier sense', plain: '判定信道忙的依据是其他站点在帧中填写的数值，而不是本机检测到的信号' },
  ],
  picture: [
    { heading: '仅靠侦听信道会遗漏什么', text: '侦听只回答一个问题：此刻空口上是否有能量？帧仍在发送时这就足够，但在帧发送完之后的停顿里就不够了——那时空口确实空闲，交互却尚未结束。而当下一帧将由房间另一端、本机根本收不到的设备发出时，侦听同样不够。' },
    { heading: '每一帧的帧头都携带一个时长值', text: '所以每一帧的前部都携带一个字段——持续时间（Duration/ID）——说明这一帧结束之后本次交互还需要多少时间。凡是解出这一帧的站点，都会用这个数启动一个倒计时，也就是网络分配向量（network allocation vector, NAV），包括那些并非接收方的站点。只要倒计时尚未到期，站点的行为就完全等同于“信道忙”。' },
    { kind: 'watch', jump: 0, heading: '观察一次计时器被设置', text: '载入仿真，跳到第一次设置预约的位置。设置预约的是旁听站点，它是在对一帧与自己无关的数据帧作出响应：帧一结束，它的倒计时就开始。' },
    { heading: '依据帧中的告知判忙', text: '这就是虚拟载波侦听（virtual carrier sense），即这条规则中与射频无关的那一部分。物理载波侦听（physical carrier sense）保护的是仍在空中的那一帧；帧头里的这个数保护的，是它之后的停顿和应答——恰恰是物理载波侦听覆盖不到的部分。' },
    { heading: '只计入剩余部分', text: '注意这个数不包括什么：它自身所在的那一帧。这也没有必要——那一帧仍在空中时，所有站点的侦听本来就报“忙”。所以数据帧填写的只是那段停顿加上确认帧（acknowledgement, ACK）的时长；同一次交互中越靠后的帧，填写的剩余时长就越短。' },
    { heading: '已经冻结，却不知道要冻结多久', text: '一个正在进行退避计数的站点，在有帧开始时立即暂停，而此时它并不知道这次中断会持续多久。它从帧头的持续时间字段读出这一帧结束之后还需要预留多长时间（这一帧本身有多长，写在物理层（physical layer, PHY）头部里）；只有当整帧都被解出，它才能信任那个数，并设置自己的倒计时。这段等待的大部分时间里，它都不知道等待何时结束——而预约到期后，它还要再等待一个分布式帧间间隔（DCF interframe space, DIFS）才轮到自己。' },
  ],
  numbers: [
    { kind: 'table', heading: '44 µs 的组成', head: [
      '组成', '时长', '出处',
    ], rows: [
      ['应答之前的停顿', '16 µs', '§17.4.4'],
      ['应答本身：14 个字节，按控制回应规则确定的 24 Mb/s', '28 µs', '§17.4.3'],
      ['数据帧填写的值', '44 µs', '§9.2.4.2'],
      ['应答填写的值', '0 µs', '交互到此结束'],
    ] },
    { heading: '每一次都是同一个值', text: '本轮仿真中 576 个数据帧填写的都是同一个 44 µs，而旁听站点的倒计时恰好在应答结束的那一纳秒到期——513 次无一例外。' },
    {
      kind: 'diagram', heading: '一段长时间冻结的分解',
      spec: navTiming(),
      caption: 'A 在 498 µs 冻结，当时它只知道信道忙。三段合计 326 µs。第一段 248 µs 是 B 那一帧在空中，A 自己的侦听就报忙；中间 44 µs 由 B 的预约覆盖，其中前 16 µs 空口空闲、只有预约阻止 A 发送，后 28 µs 是接入点（access point, AP）的确认帧，A 的侦听再次报忙；最后 34 µs 才是真正的空闲。到 824 µs 之后，A 的退避（backoff）计数从 3 继续——那是空口变忙时它尚未完成的空闲时隙（slot time）数。',
    },
    { kind: 'steps', heading: '从帧头中的一个字段到一台站点的冻结', items: [
      '发送方在发送之前先计算：这一帧结束之后还剩哪些部分——一段停顿加上应答的空口时间（airtime），这里是 16 + 28 = 44 µs——再把这个数写入帧头的 Duration 字段。',
      '结束一次交互的那一帧，填写的是“后续没有帧”。确认帧携带的就是 0 µs；而值为零的 Duration 不会为任何站点设置计时器。',
      '一台完整解出这一帧、并发现接收方是其他站点的站点，会算出一个时刻：这一帧结束的时刻加上它所填写的 Duration。',
      '只有当这个时刻晚于它当前倒计时的到期时刻时，它才采用。一帧可以把一项预约推迟，却永远不能把它提前。',
      '设置这个倒计时之后的处理，与侦听到能量时完全相同：正在进行的退避计数冻结在当前值，正在等待的帧间间隔作废，这次尝试被标记为“推迟过”。',
      '从这一刻起，直到它所设置的时刻为止，站点对介质（medium）的判定一律是“忙”，无论侦听结果如何。忙 = 侦听为忙，或者倒计时尚未到期——两者满足其一即可。',
      '到达那个时刻，倒计时解除。如果此时侦听结果为空闲，站点就开始等待它的帧间间隔，并从冻结时的值恢复接入。预约还有两种提前解除的方式，留到后面的课讲解。',
    ] },
  ],
  deeper: [
    { heading: '站点从不掌握时间表', text: '326 µs 这个总数，最早要到 746 µs 才能算出，而那时等待本身已经过去了 248 µs，约四分之三。即使算出，这个数也是有条件的：最后那 34 µs 内若又有一帧开始，它只会继续增大。站点没有任何时间表，只有一个不断修正的下界——“最早可能在 ___ 恢复”——每发生一个事件就重新计算一次；在整段冻结期间，它唯一确定的数值是冻结时的那个计数。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '预约只能来自一帧被完整解出的结果：引擎没有部分解码，所以整帧一旦接收失败，它携带的 Duration 也随之丢失（mac.ts 只在 onRxOk 里调用 updateNav）。真实帧格式把 Duration 放在帧头最前面的四个八位组里，即使整帧最终校验失败，接收端往往已经读出了这个数——因此它比这里更不容易因干扰而丢失。' },
    { kind: 'unmodelled', text: '这个倒计时是理想化的：durationFieldNs 是一个纳秒整数，倒计时由全局事件队列在那一纳秒解除。真实的 Duration/ID 是 15 位、以微秒为单位、要向上取整，最大只能表示 32 767 µs，而且依据站点自身存在偏差的时钟计时——「恰好在应答结束的那一纳秒到期，513 次无一例外」是这个模型的性质，不是空口的性质。' },
    { kind: 'out-of-scope', text: '每台站点只有一个 NAV：引擎不区分 Wi-Fi 6 之后的 intra-BSS NAV 与 basic NAV，而且一个场景只有一个接入点——第二个接入点不是被忽略，而是被拒绝：scenario.ts 的校验会直接报错。所以「邻居网络的一帧为本机设置了一个本不应有的预约」这种情况——空间复用要解决的正是它——在这里无法复现。' },
    { kind: 'unmodelled', text: '「忙」在这里只有两个来源：侦听为忙，或倒计时未到期（mac.ts 的 mediumBusy）。真实设备还会根据 L-SIG 中的长度在物理层推迟发送，还有 Wi-Fi 6 的空间复用——后者允许在其他站点的预约期间以更低的功率照常发送。这两条都没有建模，所以本课那句「两者满足其一即可」在这里是全部条件，在真实设备上只是其中两条。TXOP 保护则已建模，而它使用的正是这个倒计时：一次预约覆盖整个突发（节点上的 txopProtection，mac.ts 把剩余时长写入 Duration），后面的课会详细分析。' },
    { kind: 'model-value', text: '44 µs 里的 28 µs 来自本仿真器的 ACK 速率规则与前导码取值，换一套 PHY 取值这个数就会改变。而 Duration 是发送端自行计算的一个声明值，引擎从不校验其正确性——编辑器的「NAV 灌水」一项就是让一台设备的驱动多填时长、无端占用空口；真实网络中同样没有任何设备校验它，这也正是它被滥用的原因。' },
  ],
  sources: [
    'IEEE Std 802.11-2024 的 §10.3.2.4 给出 NAV 的更新规则：站点正确收到一帧不是发给自己的帧时，把 NAV 设为“当前值”与“帧结束时刻加 Duration”中较晚的那个。',
    'Duration 字段本身，以及“它是从当前帧结束起算、以微秒为单位的一段时间”这一含义，见 §9.2.4.2。',
    '248 µs 的帧、28 µs 的确认帧，以及图中引用的每一个时刻，都是本仿真器的场景，可以通过随机种子复现，并非取自标准正文。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Talker A', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'Talker B', 'sta', 6.5, 5, 'nonht', 'saturated'),
    node('sta-3', 'Listener', 'sta', 5, 6.5, 'nonht', 'browsing'),
  ]),
  jumps: [
    J('第一次设置 NAV', firstNav),
  ],
  observe: [
    '泳道下方那些细长的紫色条就是倒计时。它们恰好在应答结束的时刻到期——在旁听站点的 513 条中任选一条核对，结果都相同。',
    '在一帧与它的应答之间的间隙暂停：空口空闲，旁听站点自己的侦听也报空闲——但它仍然不发送。',
  ],
  tryThis: [
    '用微秒按钮把 A 从 498 µs 逐步推进到 824 µs，每推进一步就说出：它此刻处于三段等待中的哪一段。',
  ],
  quiz: [
    {
      q: '站点为自己的倒计时设置的究竟是什么？',
      options: [
        '它测得的信号强度',
        '任何它正确解出、而且不是发给自己的帧里的 Duration',
        '一个随机的等待时间',
      ],
      answer: 1,
      explain: '这一帧必须先被完整解出——接收端没有读出的数没有任何意义。至于是否为接收方，则没有要求。',
    },
    {
      q: '数据帧填写的那个数，为什么不包括这一帧自身？',
      options: [
        '因为发送方不知道自己这一帧有多长',
        '因为这一帧还在空中时，普通的侦听本来就报“忙”',
        '因为那个字段太短，无法容纳这个数',
      ],
      answer: 1,
      explain: '这个字段的作用，正是覆盖侦听覆盖不到的部分：那段空闲的停顿，以及一个可能来自本机收不到的设备的应答。',
    },
  ],
}
