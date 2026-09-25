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
 */
import type { Scenario } from '../../model/scenario'
import { J, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbRxTs, type Lesson } from '../lessonKit'
import { uwbIntroScenario } from './uwb-intro'

/** How much earlier the relay lands every leading edge, in nanoseconds. model */
export const RELAY_ADVANCE_NS = 50

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
  module: 12,
  title: '一个谁也伪造不了的时间戳',
  why: '一辆“手机走近就开锁”的车，必须相信自己的射频对距离的说法。攻击者并不需要破解任何密码，就能让它相信一个谎：只要站在收发两端之间，把信号稍微提早一点转发出去，车就会在手机还在屋里的时候打开。这一课要做的，正是把这样一个攻击者放进房间里，先把防线关掉，再把它打开。',
  outcomes: [
    '说清为什么一个用时间量出来的距离，不必破解密码也能被缩短',
    '把以纳秒计的提前量换算成它偷走的米数',
    '从日志里分辨一轮是被拒绝了，还是仅仅丢了',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'relay attack', plain: '有人守在中间，把信号提早转发出去，于是量出来的距离偏短' },
    { term: 'key', plain: '本次会话的两台射频共同持有、别人拿不到的那个秘密' },
    { term: 'STS', plain: '加扰时间戳序列：由那个秘密生成的那一段脉冲' },
  ],
  picture: [
    { heading: '真正值得攻击的是什么', text: '一轮测距里没有任何秘密在传。两台设备无非报一下自己是谁、这是第几轮，真正要紧的东西全在四个计数读数的算术里。所以既没有消息可偷，也没有密码可破。唯一值得动手脚的，是某道边沿看上去是什么时候到的——而一道到得更早的边沿，会让答案变得更小。' },
    { kind: 'watch', jump: 0, heading: '先看一轮诚实的测距', text: '载入仿真，走完一轮。这里没有人在攻击：Poll 发出去，锚点（anchor）作答，测距行落在离真值几厘米的地方。把这一行记住——下面的一切都拿它做对照。' },
    { heading: '站在中间的人', text: '现在在手机和锚点之间放一个盒子。它把传来的东西听住，再朝另一端把同样的东西发一遍。它跑不过光，所以没法让一次真实的到达变早。但它能做的是：还没听完就开始发——前提是它已经能猜出接下来是什么。猜，然后把猜出来的提前发出去：这就是中继攻击（relay attack），而且它的全部内容就是这么多。' },
    { heading: '为什么帧的开头是一份礼物', text: '一帧测距帧的头部，按设计就是公开的。同步字段（SYNC）是每个接收端本来就必须握有的图案，否则它根本锁不住信号；结束它的那个帧起始定界符（SFD）同样人尽皆知。攻击者当然也握着它们。于是，一个只对 RMARKER（ranging marker）计时、别的什么都不看的接收端，它计的正是攻击者压根不用听就能造出来的东西。' },
    { heading: '一段只有两个人写得出的脉冲', text: '解法是：在取时间的那个位置，放上一段猜不出来的东西。会话的两端共同持有一个秘密——一把密钥（key）——并各自用它生成同一段很长的脉冲：加扰时间戳序列（STS）。真实的接收端手里有自己的那一份，它拿它和收到的东西逐段比对，只有对得上才认下这个时间戳。而中间那个盒子没有这把密钥，听到的只是噪声，也就没有任何东西可以提前发出去。' },
    { heading: '你实际看到的是什么', text: '上面那种比对，是真实硬件的做法，也是标准的要求。本仿真器并不这么做：它不持有密钥，不生成脉冲，也不做任何比对。它模拟的是比对的结果——只要场景里放了转发、而且序列开着，这次接收就被拒绝；序列一关，就一律接受。这也正是这里把转发的提前量写死成 50 ns 的原因：这个房间里没有谁需要去把它检测出来。' },
    { kind: 'watch', jump: 3, heading: '现在把这段序列关掉', text: '载入第一个变体。这时中间的转发在工作，而那段序列是关掉的，于是被偷走的提前量落在这一轮的两次接收上。读一读测距行，再和旁边的真值比一比。' },
    { heading: '另一种结局：什么也没有', text: '把序列开回来，同样的转发就一个距离也产不出来了。这次接收在打时间戳之前就被拒掉，时隙也就这么空过去。被拒绝的一轮和丢失的一轮，画在地图上是一个样。可在日志里它们不是一个样——而这正是要点。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一轮的三种结局', head: [
      '场景', '真值', '测距行', '记录',
    ], rows: [
      ['诚实，基础场景', '5 m', '4.95 m', '1 × UWB_RANGE'],
      ['有转发，序列关闭', '20 m', '4.96 m', '1 × UWB_RANGE'],
      ['有转发，序列开启', '20 m', '没有', '1 × UWB_STS_REJECT, 2 × UWB_TIMEOUT'],
    ] },
    { kind: 'steps', heading: '接收端拿这段序列做什么', items: [
      '在真实的射频里，这一轮开始之前，两端各自用共同持有的那把密钥生成同一段脉冲。本仿真器的帧里留着它该在的那一段——SFD 之后，夹在两段 512 码片（chip）的静默间隔中间——但并没有真的往里面生成脉冲。',
      '中间那个盒子把听到的东西再发一遍，于是这一轮的每一次接收都提早 50 ns 落地。',
      '真实的接收端到这一步会拿收到的东西和自己那一份比对。本仿真器读的却是场景本身：场景里配了转发、序列又开着，于是它写下一条 UWB_STS_REJECT，这次读数干脆不取。',
      '这样一来，应答那个时隙里也就没有东西发出去：缺席改由时隙超时来报，这一轮以两条 UWB_TIMEOUT 收场，一个距离也没有。',
      '序列一关，同一道闸门就放行了：接收端把这 50 ns 从自己测到的到达时刻里减掉，时间戳因此偏低 3195 格——一格就是一个 RCTU（ranging counter time unit），15.650 ps——这一轮的两次接收都如此。',
      '往返时间降了 3195 格，作答时间升了 3195 格；两者之差折半，正好把整个提前量还了回来：凭空少掉手机从未走过的 14.99 m。',
    ] },
    { kind: 'formula', heading: '50 ns 值多少', text: '50 ns × 0.299792458 m/ns = 14.99 m', note: '不是它的一半，也不是两倍：这一轮的两次接收都被提前了，于是这 50 ns 的提前量整个地、一次性地从飞行时间里被扣掉。' },
    { heading: '同一次相减，换成计数单位', text: '两个接收计数值都偏低了同样多。这让往返时间变短、让作答时间变长，于是两者之差降了提前量的两倍，再一折半，正好剩下一个提前量。' },
    { kind: 'table', head: [
      '读数', '诚实的 20 m（第三个变体）', '有转发时', '出处',
    ], rows: [
      ['anchor-1 RX RMARKER ← tag-1 poll', '26 381 601 449', '26 381 598 254', 'UWB_TS'],
      ['tag-1 RX RMARKER ← anchor-1 resp', '336 335 294 125', '336 335 290 930', 'UWB_TS'],
      ['各自偏低', '—', '3195 RCTU = 50.0 ns', '15.650 ps per RCTU, §10.29'],
      ['提前量本身', '—', '50 ns', 'scenario.uwb.attacker，模型取值'],
      ['飞行时间，raw', '4267 RCTU', '1072 RCTU', '(Tround − Treply) / 2'],
      ['报出的距离', '19.95 m', '4.96 m', 'UWB_RANGE, model'],
    ] },
    { kind: 'formula', heading: '被偷走的是一个常数', text: '4267 − 1072 = 3195 RCTU；19.95 m − 4.96 m = 14.99 m', note: '它不随距离缩放，这也是两个变体都站在 20 m 的原因：同样的转发放在 5 m 上，测距会算成负数，而负的米数骗不了任何人。' },
  ],
  deeper: [
    { heading: '仿真做了什么，没做什么', text: '这里的攻击者只是一个数：会话的每一次接收都提早 advanceNs 落地。真实的转发攻击是两台射频加一根线，它换来的提前量靠的是预测帧头中确定的那一段——所以它能拿到的提前量，取决于这一帧里有多少是可预测的，而不取决于攻击者的预算。对一个 SP1 分组来说，可预测的就是 SYNC 与 SFD，到 STS 的第一个码片就戛然而止。' },
    { heading: '为什么说不的是锚点', text: '日志里那次拒绝出自锚点，针对的是 Poll 帧——因为 Poll 是这一轮的第一次接收，转发同样让它提早到达。标签根本没机会去判断一帧应答，因为锚点压根没发：它的时隙先超时了。于是一个有防护的会话在遭受攻击时，让攻击者白费一整轮，同时还向基础设施透露了一点情况——这比毫无防护的情形已经多得多。' },
    { heading: '在这里，长度就是安全性', text: '一个逐码片去猜这段序列的攻击者，每个码片赢的概率是二分之一，所以真正定下胜算的，是这段序列有多长。本仿真器发出的分组配置，在标记与头部之间放了 32 768 个码片——与开头那段 SYNC 差不多长（SYNC 是 32 512 个码片），而这一段却一个比特的信息也不携带。' },
  ],
  sources: [
    '加扰时间戳序列、它由 AES-128 密钥与计数器生成的方式，以及安放它的 SP0…SP3 分组配置，见 IEEE Std 802.15.4-2024 的 §10.32 与第 16 章；RMARKER 被定义为 SFD 之后的第一个码片，见 §10.29.1.1。“再深一层”里引用的 32 768 个有效码片，是本仿真器 SP1 段的取值（64 × 512 码片），同样依据上述条款。',
    '攻击者是模型取值，这里如实标明：对会话的每一次接收施加固定 50 ns 的提前量（scenario.uwb.attacker），并用第二个开关关闭那段序列（scenario.uwb.stsOff）。这两项都不是标准参数；标准描述的是防线，不是攻击。',
    '一次拒绝对这一轮的后果——接收端丢掉读数，由时隙超时去报告这次缺席——同样是模型取值。标准要求接收端校验这段序列并给出品质因数，但并没有规定为这次失败留下一条时间线记录。',
    '一个 RCTU 是 499.2 MHz 码片的 2⁻⁷，即 15.650 ps（§10.29）；全文采用的光速是 0.299792458 m/ns。',
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '有转发，且序列关闭', scenario: () => uwbStsScenario(true) },
    { label: '同样的转发，序列开启', scenario: () => uwbStsScenario(false) },
    // The honest 20 m room, so the counters the table compares against can be loaded from this
    // lesson. It is `uwb-intro`'s own "20 m apart" variant, scenario for scenario, so the
    // fixture entry added for it equals `uwb-intro#0` in both files.
    { label: '诚实的 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧离开手机', firstUwbPoll),
    J('锚点记下到达的 RMARKER', firstUwbRxTs),
    J('锚点作答', firstUwbResp),
    J('距离算出来了', firstUwbRange),
  ],
  observe: [
    '在基础场景里读 2 187 389 ns 处的 UWB_RANGE：报出 4.95 m，真值 5.00 m。这里没有人在攻击，唯一的误差就是你已经认识的时间戳噪声。',
    '载入第一个变体，找到同一行。它现在写着 4.96 m，而真值是 20.00 m：手机在大厅另一头，锚点却被告知它近在咫尺。',
    '载入第二个变体。这里一个距离也没有：anchor-1 针对 Poll 帧给出一条 UWB_STS_REJECT，随后两个时隙依次空过，留下两条 UWB_TIMEOUT。',
  ],
  tryThis: [
    '把第一个变体、以及第三个变体（诚实的 20 m 房间）里的两个 RX 计数值都抄下来，分别相减。两个差都是 3195 RCTU，也就是 50.0 ns——这正是那个提前量，在这一轮的两侧各落了一次。',
    '算一算这个转发放在 5 m 上会偷走多少。它偷走的还是那 14.99 m，于是距离会算到零以下。一个对所在房间来说太贪心的转发，攻击者从中什么也捞不着。',
  ],
  quiz: [
    {
      q: '为什么一次转发居然能把量出来的距离变短？',
      options: [
        '它把信号放大了，而更响的信号会被读成更近',
        '它把帧里能预测出来的那一段，在还没听完时就先发了出去',
        '它把帧缩短了，于是这一帧结束得更早',
      ],
      answer: 1,
      explain: '谁也跑不过光。提前量来自于猜中帧那段公开的开头，再把猜出来的提前发出去。',
    },
    {
      q: '攻击者让每一次接收都提早 50 ns 落地。距离会缩短多少？',
      options: [
        '约 7.5 m：往返要折半',
        '约 15 m：两次接收都动了，折半正好被抵消',
        '约 30 m：两次接收都动了，而且各算两次',
      ],
      answer: 1,
      explain: '一个读数降、另一个升，幅度相同，于是两者之差变动了提前量的两倍，再折半又把 50 ns 还了回来——14.99 m。',
    },
    {
      q: '把那段序列开启之后，同样的转发会产生什么？',
      options: [
        '一个正确的距离：接收端把时间戳修好了',
        '没有距离：读数被拒绝，时隙空过',
        '一个偏长 15 m 而不是偏短 15 m 的距离',
      ],
      answer: 1,
      explain: '没有任何东西可以拿来修一个时间戳：这次接收被直接拒掉，这一轮以一条拒绝和两条超时收场，而不是一个距离。',
    },
  ],
}
