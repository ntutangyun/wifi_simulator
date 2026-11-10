/**
 * UWB Tier 1 · M14 · Time of flight · A timestamp nobody can fake.
 *
 * In the standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① what IEEE Std 802.15.4-2024 specifies for the scrambled timestamp sequence — where it sits,
 * how the transmitter generates it, what the receiver is expected to do with it and who decides
 * whether a reading is used; ② what this simulator does instead, row by row — it holds no seed,
 * generates no pulse and correlates nothing: `onRx` in src/uwb/device.ts rejects a reception when
 * the scenario configures an attacker and leaves the sequence on, and runs no check at all when
 * there is no attacker; ③ three guided runs: the honest round, a relay with the check switched
 * off, and the same relay with it on.
 *
 * The base scene is `uwb-intro`'s own. The two attacked variants run at 20 m, so the spoofed
 * range is a plausible 5 m rather than a negative number.
 *
 * Every figure printed below is read back out of the lesson text and compared with a run in
 * tests/course/uwb-sts.test.ts.
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
  why: '一辆“手机走近就开锁”的车，必须信任自己的测距设备给出的距离。攻击者并不需要破解任何密码，就能使它接受一个错误的距离：本课这一轮测距中不传送任何秘密，关键只在于边沿的到达时刻。位于中间的转发设备无法比光更快，却能在尚未收完时就把可预测的部分提前发出，这就是中继攻击（relay attack）。一帧开头的同步字段（SYNC field, SYNC）与帧起始定界符（start-of-frame delimiter, SFD）都是公开的图案，于是这一轮的两次接收各提前同样的时间：往返时间减少这一量，回复时间增加这一量，相减再除以二后，整个提前量全部从飞行时间中扣除，距离缩短量等于提前量乘以光速，与实际距离无关。IEEE 802.15.4-2024 为此在打时间戳的位置附近放置加扰时间戳序列（scrambled timestamp sequence, STS）：发送端用 AES-128 从上层设定的种子生成一段伪随机脉冲序列，接收端预期用同样的种子生成副本做互相关，并为每个序列段报告一个相关强度；是否采用这次读数、是否应答，由上层决定。转发设备没有种子，无法预测这一段。本仿真器不生成序列、不做互相关，只按场景给出结果：有转发且序列开启时拒绝这次接收，这一轮不产生距离，两个时隙都以超时结束。',
  outcomes: [
    '说明为什么基于时间测得的距离不必破解密码也能被缩短，并把提前量换算成距离',
    '说出标准对 STS 规定了什么：位置、生成方式、接收端的相关强度与上层的决定',
    '从日志中分辨一轮是被拒绝，还是仅仅丢失，并说出本仿真器在哪里没有照标准做',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'relay attack', plain: '攻击者在两端之间提前转发信号，使测得的距离偏短；标准不描述攻击，这是安全领域的叫法' },
    { term: 'key', plain: '本次会话两端共同持有、他人无法获得的秘密；生成 STS 用的是上层设定的 128 位种子' },
    { term: 'STS', plain: '加扰时间戳序列：由种子经 AES-128 生成的一段伪随机脉冲序列' },
  ],
  standard: [
    { heading: 'STS 的结构（§16.2.9.1，表 16-17）', text: 'STS 是一串伪随机脉冲，由基于 AES-128 计数器模式的确定性随机比特发生器生成，排成一到四个有效段，每段前后是 512 个码片（chip）的静默间隔。BPRF 模式必须支持一个段，长 64 × 512 码片，每 8 个码片一个脉冲。配置 1 把它放在 SFD 之后、物理头（PHY header, PHR）之前（表 16-1）。' },
    { heading: '怎样生成（§16.2.9.2、§16.2.9.3）', text: '上层设定 128 位的 STS 种子与 128 位的 V 初值。发生器每运行一次产生 128 个伪随机比特，对应 128 个脉冲；每次运行后 V 中 32 位的计数器部分加一。比特 0 产生正极性脉冲，比特 1 产生负极性脉冲。种子与 V 怎样在两端之间约定与同步，由上层负责，可以用 RSSD 信息单元传送（§10.29.8.2）。' },
    { heading: '接收端做什么（§16.2.9.2、§8.3.2.3）', text: '标准只规定发送端的操作，并说明接收端预期用同样的种子与 V 生成参考序列，与收到的序列做互相关。接收端为每个 STS 段报告一个 RangingStsFom：收到的序列段与参考序列段的相关强度，255 表示 100 %，0 表示没有给出。' },
    { heading: '是否采用，由上层决定（§10.29.6.1、§6.6.2）', text: '增强测距设备提供附加的原语，上层可以依据它对时间戳结果的验证改变自己的动作，例如是否在测距交换中应答、是否把这次结果视为可用；对 HRP 设备，可以依据 RangingStsFom 做出这一判断。只有对只含 SYNC、SFD 与 STS 的配置 3 分组，标准才允许媒体访问控制（medium access control, MAC）层或物理层（physical layer, PHY）在序列不匹配时直接丢弃这一帧，或者照收并通过 RangingStsFom 交给上层判断。' },
    { kind: 'steps', heading: '一次带 STS 的测距接收，按标准：逐步说明', items: [
      '两端的上层事先约定 STS 种子与 V 的初值（§16.2.9.2）。',
      '发送端按配置 1 组帧，在 SFD 之后发送由种子生成的 STS（表 16-1、§16.2.9.3）。',
      '接收端用同样的种子与 V 生成参考序列，与收到的 STS 做互相关（§16.2.9.2）。',
      '接收端随这次接收的时间报告给出每个段的 RangingStsFom（§8.3.2.3）。',
      '上层依据 RangingStsFom 决定是否采用这次读数、是否应答（§10.29.6.1）；序列不匹配之后怎样处理、是否记录，标准没有规定。',
    ] },
  ],
  implementation: [
    { topic: 'STS 的位置与长度', standard: '配置 1：SFD 之后、PHR 之前；64 × 512 码片，前后各 512 码片间隔（表 16-1、表 16-17）', sim: '照此计入帧长：STS 与两段间隔共 33 792 码片。', kind: 'faithful' },
    { topic: 'STS 的生成', standard: 'AES-128 计数器模式，种子与 V 由上层设定（§16.2.9.2）', sim: '不生成序列，也不持有种子：序列只是帧里的一段长度，32 768 个码片与 32 个码片给出相同的结果。', kind: 'absent' },
    { topic: '接收端的互相关', standard: '用参考序列做互相关，报告 RangingStsFom（§16.2.9.2、§8.3.2.3）', sim: '不做互相关，也不报告 RangingStsFom。场景里有转发且序列开启，就判为不一致；没有转发时不做任何判断。', kind: 'absent' },
    { topic: '是否采用', standard: '由上层依据 RangingStsFom 决定（§10.29.6.1）', sim: '判为不一致时一律不采用：写一条 UWB_STS_REJECT，锚点（anchor）不应答。', kind: 'choice' },
    { topic: '拒绝之后', standard: '标准未规定', sim: '这一轮以两条 UWB_TIMEOUT 结束：锚点在时隙 0 没等到可用的 Poll，手机在时隙 1 没等到应答。会话不重试、不告警，也不把这一轮记成一次攻击。', kind: 'choice' },
    { topic: '关闭序列', standard: '不含 STS 的帧是配置 0（表 16-1）', sim: '场景的「序列关闭」只关掉判断：帧仍按配置 1 计长度，到达时刻照样提前。这与标准里换成配置 0 不同。', kind: 'differs' },
    { topic: '转发设备', standard: '标准不描述攻击', sim: '一个固定的提前量：会话的每一次接收都提前 50 ns，与转发设备的位置、转发路径的长度都无关；只会提前，不会延后。', kind: 'value' },
    { topic: 'STS 内的附加时标', standard: '在各 STS 段的起止处另定义 SRMARKER0 到 SRMARKER4，报告它们的计数值是可选的（§16.2.9.4）', sim: '不报告。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '没有转发的一轮',
      jump: 3,
      steps: [
        '载入本课场景，运行完一轮，跳到距离计算完成的时刻。',
        '在日志里找 UWB_STS_REJECT。',
      ],
      expect: '测距行报出 4.95 m，真值 5.00 m；日志里没有 UWB_STS_REJECT。',
      meaning: '场景里没有转发时，本仿真器不做任何判断（②），这一轮与上一课完全相同。',
    },
    {
      heading: '序列关闭时，转发缩短了 15 m',
      variant: 0,
      more: [2],
      steps: [
        '载入「有转发，且序列关闭」，读测距行，再载入「无转发的 20 m」对照。',
        '把两次运行里的两个接收计数值分别相减，以 RCTU（ranging counter time unit）为单位，对照下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '无转发的一轮，和被转发的一轮', spec: uwbStsSequence(), caption: '同一个 20 m 的房间。转发设备只要预测出一帧开头公开的 SYNC 与 SFD，就能提前 50 ns 发出。' },
        { kind: 'table', heading: '同一次相减，换成计数单位', head: ['读数', '无转发的 20 m', '有转发、序列关闭'], rows: [
          ['anchor-1 RX RMARKER ← tag-1 poll', '26 381 601 449', '26 381 598 254'],
          ['tag-1 RX RMARKER ← anchor-1 resp', '336 335 294 125', '336 335 290 930'],
          ['飞行时间，raw', '4267 RCTU', '1072 RCTU'],
          ['报出的距离', '19.95 m', '4.96 m'],
        ] },
        { kind: 'formula', heading: '50 ns 对应多少距离', text: '50 ns × 0.299792458 m/ns = 14.99 m\n4267 − 1072 = 3195 RCTU；19.95 m − 4.96 m = 14.99 m', note: '两次接收都提前了 50 ns：往返时间少 50 ns，回复时间多 50 ns，相减再除以二，恰好是整个提前量。' },
      ],
      expect: '两个接收计数值都比无转发时小 3195 RCTU，即 50.0 ns；测距行报出 4.96 m，而真值是 20.00 m。',
      meaning: '帧开头的 SYNC 与 SFD 是公开的图案（①），可以被提前发出；本仿真器的「序列关闭」不做任何判断（②），于是整个提前量都进了距离。',
    },
    {
      heading: '序列开启时，这一轮没有距离',
      variant: 1,
      more: [0],
      steps: [
        '载入「同样的转发，序列开启」，运行完一轮。',
        '按时间顺序读这一轮的记录，与序列关闭的那次对照。',
      ],
      blocks: [
        { kind: 'table', heading: '同一轮的三种结果', head: ['场景', '真值', '测距行', '记录'], rows: [
          ['无转发，基础场景', '5 m', '4.95 m', '1 × UWB_RANGE'],
          ['有转发，序列关闭', '20 m', '4.96 m', '1 × UWB_RANGE'],
          ['有转发，序列开启', '20 m', '没有', '1 × UWB_STS_REJECT, 2 × UWB_TIMEOUT'],
        ] },
      ],
      expect: 'anchor-1 针对 Poll 写一条 UWB_STS_REJECT，随后在 2 000 000 ns 与 4 000 000 ns 各有一条 UWB_TIMEOUT，没有测距行。',
      meaning: '转发设备没有种子，无法预测 STS（①）；本仿真器不做互相关，只给出「不采用」这个结果（②），而标准把是否采用交给上层依据 RangingStsFom 决定。被拒绝的一轮在日志里与单纯丢失的一轮不同：多一条拒绝记录。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§16.2.9.1 与表 16-17（STS 的段与间隔）、§16.2.9.2（AES-128 生成，接收端预期做互相关，种子与 V 由上层约定）、§16.2.9.3（每个比特决定一个脉冲的极性）、§16.2.9.4（SRMARKER）、§16.2.1 与表 16-1（分组配置）、§8.3.2.3 与表 8-28（RangingStsFom）、§10.29.6.1（上层依据验证结果决定是否应答）、§6.6.2（配置 3 分组的接收）、§10.29.8.2（RSSD 信息单元）。',
    '本仿真器的取值与取法：转发设备是加在每一次接收上的固定 50 ns 提前量；「序列开启且有转发」即拒绝，拒绝后锚点不应答、两个时隙超时；「序列关闭」只关掉判断，不改分组配置。标准不描述攻击。',
    '一个 RCTU 是 499.2 MHz 码片周期的 2⁻⁷，即 15.650 ps（§10.29.1.4）；全文采用的光速是 0.299792458 m/ns。',
  ],
  limits: [],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '有转发，且序列关闭', scenario: () => uwbStsScenario(true) },
    { label: '同样的转发，序列开启', scenario: () => uwbStsScenario(false) },
    // The honest 20 m room, so the counters the table compares against can be loaded from this
    // lesson. It is `uwb-intro`'s own "20 m apart" variant, scenario for scenario.
    { label: '无转发的 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('锚点记下到达的 RMARKER', firstUwbRxTs),
    J('锚点作答', firstUwbResp),
    J('距离计算完成', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
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
      q: '按标准，接收端发现 STS 与参考序列相关很弱时，谁决定是否采用这次读数？',
      options: [
        '物理层：标准要求它在任何配置下都直接丢弃这一帧',
        '上层：它依据接收端报告的 RangingStsFom 决定是否采用、是否应答',
        '发送端：它在下一帧里重发 STS',
      ],
      answer: 1,
      explain: '§10.29.6.1 把这一决定交给上层；只有配置 3 分组，§6.6.2 才允许 MAC 或物理层直接丢弃。本仿真器则一律不采用。',
    },
  ],
}
