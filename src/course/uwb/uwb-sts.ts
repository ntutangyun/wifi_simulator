/**
 * UWB Tier 1 · M11 · Time of flight · A timestamp nobody can fake.
 *
 * The security lesson of the ranging tier, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). `uwb-frame`
 * named the STS in one line and moved on; this lesson is what that line was for.
 *
 * The base scene is `uwb-intro`'s own — the same builder, the same five metres,
 * the same variant-free honest round — so the lesson costs the reader no new
 * room to learn and its recorded base hashes are uwb-intro's, value for value.
 * The two variants put an attacker in that room: a relay that makes every
 * reception's leading edge land 50 ns early (`uwb.attacker`, model), once with
 * the scrambled timestamp sequence switched off (`uwb.stsOff`) and once with it
 * on. Both run at 20 m, so the spoofed range is a plausible 5 m rather than a
 * negative number — a relay steals a fixed 14.99 m whatever the true distance,
 * and at five metres that reads as nonsense instead of as a lie.
 *
 * Two voices, kept apart on the main path (fix round, 2026-09-23): what a real
 * radio does — generate the sequence from the key, place it in the frame,
 * compare what arrived against its own copy — and what this simulator does,
 * which is none of that. `onRxOk` in src/uwb/device.ts is a gate on the
 * scenario: reject when an attacker is configured and the sequence is on,
 * accept when it is off, and with no attacker run no check at all. The picture
 * ("What you are actually watching") and step 3 say so where the beginner is,
 * because a lesson that narrated a correlation here would teach the reader to
 * see one in a log that never holds one.
 *
 * Every number quoted below is pinned in tests/course/uwb-sts.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-sts` prints it with its length.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M13). It **stays whole**: a relay attack without the STS leaves the reader
 * with a defect and no fix. What changed:
 *  - §4 gives it a `sequence` figure — the honest round, and the round the box in
 *    the middle forwards early — and the figure replaces the paragraph
 *    「为什么帧的开头是一份礼物」, whose metaphor §5.2 deletes. The one clause that
 *    paragraph carried and no figure can (a receiver that times the RMARKER and
 *    looks at nothing else is timing what the attacker can manufacture) now opens
 *    the paragraph about the fix, where it belongs.
 *  - §5.6 says to keep ONE of the two honest paragraphs about what this simulator
 *    does instead of holding a key, not neither. The one on the main path stays,
 *    word for word, because that is where the beginner meets the rejection; the
 *    depth paragraph that told it a second time is now only about what a real
 *    relay can reach (SYNC and SFD, and no further).
 *  - the paragraph that re-derived the halving in counter units went: the two
 *    formula notes and steps 5 and 6 already say it, and the table it introduced
 *    now carries its heading.
 * The pin that no main-path sentence claims a correlation was performed is still
 * here ("no attacker, no check"), and the STS is still about as long as the SYNC
 * (32 768 chips against 32 512), never two thirds as long again.
 */
import type { Scenario } from '../../model/scenario'
import type { SequenceSpec } from '../diagram'
import { J, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbRxTs, type Lesson } from '../lessonKit'
import { uwbIntroScenario } from './uwb-intro'

/** How much earlier the relay lands every leading edge, in nanoseconds. model */
export const RELAY_ADVANCE_NS = 50

/** The two ranges the figure prints, as the two runs report them. */
export const HONEST_20_M = '19.95 m'
export const SPOOFED_M = '4.96 m'

/**
 * The same 20 m room twice: the honest round, and the round with a box in the
 * middle. The figure's two ranges are the two runs' own, and the middle column
 * exists to show what the relay actually has to work with — the part of the
 * frame that is public.
 */
export function uwbStsSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'tag-1', label: '手机 tag-1' },
      { id: 'box', label: '中间的盒子' },
      { id: 'anchor-1', label: '锚点 anchor-1' },
    ],
    messages: [
      { from: 'tag-1', to: 'anchor-1', label: '无转发的 Poll', at: HONEST_20_M },
      { from: 'tag-1', to: 'box', label: '公开的那两段' },
      { from: 'box', to: 'anchor-1', label: `提早 ${RELAY_ADVANCE_NS} ns`, at: SPOOFED_M, tone: 'accent' },
    ],
  }
}

/**
 * The honest scene with a relay added, at 20 m: `stsOff` decides whether the receiver has
 * anything unforgeable to time. Nothing else about the room moves, so every difference the
 * lesson shows is the attacker's doing and nothing else's.
 */
export function uwbStsScenario(stsOff: boolean): Scenario {
  const base = uwbIntroScenario(20)
  return {
    ...base,
    uwb: {
      ...base.uwb!,
      attacker: { advanceNs: RELAY_ADVANCE_NS },
      ...(stsOff ? { stsOff: true } : {}),
    },
  }
}

export const uwbSts: Lesson = {
  id: 'uwb-sts',
  module: 14,
  title: '一个无法伪造的时间戳',
  why: '一辆“手机走近就开锁”的车，必须信任自己的测距设备给出的距离。攻击者并不需要破解任何密码，就能使它接受一个错误的距离：一轮测距中本来就不传送任何秘密，关键只在于边沿的到达时刻。位于中间的转发设备无法比光更快，却能在尚未收完时就把可预测的部分提前发出，这就是中继攻击（relay attack）。一帧开头的同步图案、以及标示同步结束的那一小段图案都是公开的，于是这一轮的两次接收各提前同样的时间：往返时间减少这一量，作答时间增加这一量，相减再除以二后，整个提前量全部从飞行时间中扣除。距离缩短量等于提前量乘以光速，与实际距离无关——远在大厅另一端的手机被报告为近在咫尺；而在很小的房间里施加同样的转发，会算出负的距离，因而无法欺骗任何设备。防御方法是在打时间戳的位置放置一段无法预测的脉冲序列：两端用共同持有的密钥（key）各自生成加扰时间戳序列（scrambled timestamp sequence, STS），接收端只有在比对一致时才接受时间戳。中间的转发设备没有密钥，无法提前；被拒绝的一轮不产生距离，两个时隙都以超时结束，在日志中可以与单纯丢失的一轮区分开来。',
  outcomes: [
    '说明为什么基于时间测得的距离不必破解密码也能被缩短',
    '把以纳秒计的提前量换算成距离的缩短量',
    '从日志中分辨一轮是被拒绝，还是仅仅丢失',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'relay attack', plain: '攻击者在两端之间提前转发信号，使测得的距离偏短' },
    { term: 'key', plain: '本次会话的两台设备共同持有、他人无法获得的秘密' },
    { term: 'STS', plain: '加扰时间戳序列：由该密钥生成的一段脉冲序列' },
  ],
  picture: [
    { heading: '真正值得攻击的是什么', text: '一轮测距里没有任何秘密在传：两台设备只是报告自己的身份和轮次，关键信息全在四个计数读数的运算中。既没有消息可窃取，也没有密码可破解，唯一值得篡改的是某个边沿的表观到达时刻——而一个更早到达的边沿会使结果变小。' },
    { kind: 'watch', jump: 0, heading: '先看一轮无转发的测距', text: '载入仿真，运行完一轮。这里没有攻击：Poll 发出，锚点（anchor）作答，测距行与真值相差几厘米。记住这一行——下面的内容都以它为对照。' },
    { heading: '中继转发：先预测，再提前发出', text: '现在在手机和锚点之间放置一台转发设备。它接收传来的信号，再向另一端重新发送同样的内容。它无法比光更快，所以不能使一次真实的到达提前。但它能做到的是：尚未收完就开始发送——前提是它已经能预测接下来的内容。预测，然后提前发出预测的内容：这就是中继攻击（relay attack）的全部原理。' },
    {
      kind: 'diagram', heading: '无转发的一轮，和被转发的一轮', spec: uwbStsSequence(),
      caption: '同一个 20 m 的房间。上面那条是无转发的一轮：Poll 直接传播到锚点，测距行报出 19.95 m。下面是转发——中间的转发设备只要预测出一帧开头那两段公开的图案——同步字段（SYNC）和标示它结束的帧起始定界符（SFD）——就能提前 50 ns 发出；于是同一个房间报出 4.96 m。',
    },
    { heading: '一段只有会话两端能够生成的脉冲', text: '如果接收端只对 RMARKER（ranging marker）计时而不检查其他内容，它计时的正是攻击者无需接收就能构造的信号。解决方法是：在打时间戳的位置放置一段无法预测的内容。会话的两端共同持有一个秘密——密钥（key）——并各自用它生成同一段很长的脉冲序列：加扰时间戳序列（STS）。真实的接收端持有自己的那一份副本，用它与收到的信号逐段比对，只有一致时才接受这个时间戳。而中间的转发设备没有这把密钥，收到的这一段在它看来只是噪声，也就没有任何内容可以提前发出。' },
    { heading: '本课实际呈现的内容', text: '上面那种比对是真实硬件的做法，也是标准的要求。本课不演示比对的过程，只给出它的结果：只要场景中有转发且序列开启，这次接收就被拒绝；序列关闭时则一律接受。转发的提前量在本课固定取 50 ns，标准不规定这个数。' },
    { kind: 'watch', jump: 3, heading: '现在关闭这段序列', text: '载入第一个变体。此时中间的转发在工作，而那段序列处于关闭状态，于是转发的提前量作用在这一轮的两次接收上。读取测距行，并与旁边的真值比较。' },
    { heading: '另一种结果：没有距离', text: '重新开启序列，同样的转发就不再产生任何距离：这次接收在打时间戳之前即被拒绝，两个时隙空闲度过。被拒绝的一轮和丢失的一轮在地图上表现相同，在日志中则不同——这正是要点。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一轮的三种结果', head: [
      '场景', '真值', '测距行', '记录',
    ], rows: [
      ['诚实，基础场景', '5 m', '4.95 m', '1 × UWB_RANGE'],
      ['有转发，序列关闭', '20 m', '4.96 m', '1 × UWB_RANGE'],
      ['有转发，序列开启', '20 m', '没有', '1 × UWB_STS_REJECT, 2 × UWB_TIMEOUT'],
    ] },
    { kind: 'steps', heading: '接收端如何使用这段序列', items: [
      '在真实设备中，这一轮开始之前，两端各自用共同持有的那把密钥生成同一段脉冲序列。它在帧里的位置是 SFD 之后，位于两段 512 码片（chip）的静默间隔之间。',
      '中间的转发设备把收到的内容重新发送，于是这一轮的每一次接收都提前 50 ns 到达。',
      '真实的接收端在这一步会将收到的信号与自己的副本比对，转发的这一帧比对不一致。本课只给出这个结果：日志中出现一条 UWB_STS_REJECT，这次读数不予采用。',
      '因此应答时隙中也不会发送任何帧：缺失的应答由时隙超时报告，这一轮以两条 UWB_TIMEOUT 结束，不产生任何距离。',
      '序列关闭时，接收端没有可比对的内容，一律接受：到达时刻比真实的早 50 ns，时间戳因此偏低 3195 格——一格就是一个 RCTU（ranging counter time unit），15.650 ps——这一轮的两次接收都如此。',
      '往返时间减少 3195 格，作答时间增加 3195 格；两者之差再除以二，恰好等于整个提前量：距离凭空减少了 14.99 m，而手机并没有移动。',
    ] },
    { kind: 'formula', heading: '50 ns 对应多少距离', text: '50 ns × 0.299792458 m/ns = 14.99 m', note: '不是它的一半，也不是两倍：这一轮的两次接收都被提前了，于是这 50 ns 的提前量被完整地、一次性地从飞行时间中扣除。' },
    { kind: 'table', heading: '同一次相减，换成计数单位', head: [
      '读数', '无转发的 20 m（第三个变体）', '有转发时', '出处',
    ], rows: [
      ['anchor-1 RX RMARKER ← tag-1 poll', '26 381 601 449', '26 381 598 254', 'UWB_TS'],
      ['tag-1 RX RMARKER ← anchor-1 resp', '336 335 294 125', '336 335 290 930', 'UWB_TS'],
      ['各自偏低', '—', '3195 RCTU = 50.0 ns', '15.650 ps per RCTU, §10.29'],
      ['提前量本身', '—', '50 ns', '本课取值，标准不规定'],
      ['飞行时间，raw', '4267 RCTU', '1072 RCTU', '(Tround − Treply) / 2'],
      ['报出的距离', '19.95 m', '4.96 m', 'UWB_RANGE, model'],
    ] },
    { kind: 'formula', heading: '距离的缩短量是一个常数', text: '4267 − 1072 = 3195 RCTU；19.95 m − 4.96 m = 14.99 m', note: '它不随距离变化，这也是两个变体都设在 20 m 的原因：在 5 m 上施加同样的转发，测得的距离会是负数，而负的距离无法欺骗任何设备。' },
  ],
  deeper: [
    { heading: '真实的转发能拿到多少提前量', text: '本课里的攻击者只是一个固定的提前量：会话的每一次接收都提前同样的时间到达。真实的转发攻击由两台射频设备和一条连接线路构成，它获得的提前量依赖于预测帧头中确定的部分——所以它能拿到多少，取决于这一帧里有多少是可预测的，而不取决于攻击者的预算。对一个 SP1 分组来说，可预测的就是 SYNC 与 SFD，到 STS 的第一个码片为止。' },
    { heading: '为什么做出拒绝的是锚点', text: '日志里那次拒绝出自锚点，针对的是 Poll 帧——因为 Poll 是这一轮的第一次接收，转发同样让它提早到达。标签没有机会判断应答帧，因为锚点根本没有发送：它的时隙已先超时。因此，有防护的会话在遭受攻击时使攻击者整轮一无所获，同时还向基础设施提供了一些信息——这比毫无防护的情形好得多。' },
    { heading: '在这里，长度就是安全性', text: '逐码片猜测这段序列的攻击者，每个码片猜对的概率是二分之一，所以真正决定成功概率的，是这段序列有多长。本课用的分组配置，在标记与头部之间放了 32 768 个码片——与开头那段 SYNC 差不多长（SYNC 是 32 512 个码片），而这一段不携带任何信息比特。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '本课不持有密钥、不生成脉冲、也不做比对——如正文所述，这里只记录结果：场景中有转发且序列开启，就出现一条 UWB_STS_REJECT，序列关闭则一律接受。于是这是一个开关，而不是一次判决：没有误拒、没有攻击者猜中若干码片的可能，也没有「序列多长才算够」这条曲线。「再深一层」里那句「长度就是安全性」在这个模型里是零成本的，因为 32 768 个码片和 32 个码片在这里给出完全相同的结果。' },
    { kind: 'model-value', text: '50 ns 的提前量是本课固定取的一个数，与转发设备的位置、它与两端的距离、转发链路本身的长度均无关：中继在本课里不是房间里的一台设备，而是加在每一次接收上的一个固定提前量。真实的提前量上限由帧头中可预测的那一段决定，而攻击者自己的处理时延还要从中扣掉一部分，所以它既不是一个自由参数，也不会在两个方向上一样大。' },
    { kind: 'out-of-scope', text: '标准在 STS 段内部还定义了五个附加时标（SRMARKER0 到 SRMARKER4，§16.2.9.4），本课都不使用，而这是一条范围决定，不是一处缺口。BPRF 强制参数集只有一个 STS 段（Table 16-17、Table 16-31），所以五个里只有两个存在：第一个与 RMARKER 同时刻——正文自己写明，PHR 排在 STS 之后、或者整个不存在的那两种分组配置下如此，而本课只用这两种——第二个落在段尾那个 512 码片的静默间隔上，比第一个晚 66 667 ns。它们在本课里唯一可能的用途是 §10.29.1.1 那个相对时钟偏差估计：66.667 µs 的跨度配 100 ps 的时间戳只能达到 2.1 ppm，比本课取的 0.2 ppm 差十倍，所以读出这两个标记也不会让距离更准。' },
    { kind: 'out-of-scope', text: '这个攻击者只会把边沿提前，而且对本会话的每一次接收作用相同。延迟转发把距离拉长、只攻击一个方向、放大转发、两台设备协同的距离欺骗，本课都不涉及；多毫秒片段的测距也不在这个攻击者的作用范围之内。所以本课证明的是「这一类攻击被这一道防线阻止了」，不是「测距是安全的」。' },
    { kind: 'unmodelled', text: '一次拒绝之后不会触发任何后续处理：那个时隙按普通超时结束，会话不重试、不告警、不换密钥，也不把这一轮记成一次攻击。真实实现会把连续的拒绝上报给上层并触发对策，而本课能观察到的只有「这一轮没有距离」——与一次纯粹的丢帧在地图上完全一样，只在日志中相差一行。' },
  ],
  sources: [
    '加扰时间戳序列、它由 AES-128 密钥与计数器生成的方式，以及安放它的 SP0…SP3 分组配置，见 IEEE Std 802.15.4-2024 的 §10.32 与第 16 章；RMARKER 被定义为 SFD 之后的第一个码片，见 §10.29.1.1。“再深一层”里引用的 32 768 个有效码片，是本仿真器 SP1 段的取值（64 × 512 码片），同样依据上述条款。',
    '攻击者是模型取值，这里如实标明：对会话的每一次接收施加固定 50 ns 的提前量，并用第二个开关关闭那段序列。这两项都不是标准参数；标准描述的是防线，不是攻击。',
    '一次拒绝对这一轮的后果——接收端丢掉读数，由时隙超时报告这次缺失的应答——同样是模型取值。标准要求接收端校验这段序列并给出品质因数，但并没有规定为这次失败留下一条时间线记录。',
    '一个 RCTU 是 499.2 MHz 码片的 2⁻⁷，即 15.650 ps（§10.29）；全文采用的光速是 0.299792458 m/ns。',
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '有转发，且序列关闭', scenario: () => uwbStsScenario(true) },
    { label: '同样的转发，序列开启', scenario: () => uwbStsScenario(false) },
    // The honest 20 m room, so the counters the table compares against can be loaded from this
    // lesson. It is `uwb-intro`'s own "20 m apart" variant, scenario for scenario, so the
    // fixture entry added for it equals `uwb-intro#0` in both files.
    { label: '无转发的 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('锚点记下到达的 RMARKER', firstUwbRxTs),
    J('锚点作答', firstUwbResp),
    J('距离计算完成', firstUwbRange),
  ],
  observe: [
    '在基础场景里读 2 187 389 ns 处的 UWB_RANGE：报出 4.95 m，真值 5.00 m。这里没有攻击，唯一的误差就是前面已介绍过的时间戳噪声。',
    '载入第一个变体，找到同一行。它现在写着 4.96 m，而真值是 20.00 m：手机在大厅另一端，锚点却被告知它近在咫尺。',
    '载入第二个变体。这里没有任何距离：anchor-1 针对 Poll 帧给出一条 UWB_STS_REJECT，随后两个时隙依次空闲度过，留下两条 UWB_TIMEOUT。',
  ],
  tryThis: [
    '把第一个变体、以及第三个变体（无转发的 20 m 房间）里的两个 RX 计数值都记下来，分别相减。两个差都是 3195 RCTU，也就是 50.0 ns——这正是那个提前量，在这一轮的两次接收中各出现一次。',
    '计算一下：在 5 m 的距离上施加这个转发，距离会缩短多少。缩短量仍是 14.99 m，于是算出的距离小于零。如果转发的提前量相对于房间尺寸过大，攻击者就无法从中得到任何好处。',
  ],
  quiz: [
    {
      q: '为什么一次转发能使测得的距离变短？',
      options: [
        '它把信号放大了，而更强的信号会被判读为更近',
        '它把帧中可预测的那一段在尚未收完时就提前发出',
        '它把帧缩短了，于是这一帧结束得更早',
      ],
      answer: 1,
      explain: '任何信号都无法比光更快。提前量来自预测出帧开头那段公开的内容，再将其提前发出。',
    },
    {
      q: '攻击者使每一次接收都提前 50 ns 到达。距离会缩短多少？',
      options: [
        '约 7.5 m：往返要折半',
        '约 15 m：两次接收都受到影响，除以二恰好与之抵消',
        '约 30 m：两次接收都受到影响，而且各计两次',
      ],
      answer: 1,
      explain: '一个读数减小、另一个增大，幅度相同，于是两者之差的变化是提前量的两倍，再除以二又恰好得到 50 ns——14.99 m。',
    },
    {
      q: '把那段序列开启之后，同样的转发会产生什么？',
      options: [
        '一个正确的距离：接收端修正了时间戳',
        '没有距离：读数被拒绝，时隙空闲',
        '一个偏长 15 m 而不是偏短 15 m 的距离',
      ],
      answer: 1,
      explain: '接收端没有任何依据可以修正时间戳：这次接收被直接拒绝，这一轮以一条拒绝记录和两条超时记录结束，而不是给出一个距离。',
    },
  ],
}
