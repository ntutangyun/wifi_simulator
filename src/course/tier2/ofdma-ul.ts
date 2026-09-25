/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · the triggered uplink.
 *
 * Re-paced 2026-09-26. The proposal split this lesson in two because it carried
 * two `steps` blocks; the controller's ruling (§8) is that it stays whole —
 * "two `steps` blocks is a tell, not a proof", and the trigger frame and the
 * round it schedules are one idea seen twice. So the tell is answered rather
 * than obeyed: the five things the trigger settles are a `list`, because a list
 * of what one frame fixes is not a procedure, and the one procedure left is the
 * engine's own order for arranging a round. §9's fallback instructions are
 * carried out with it: the power-control aside is one sentence in `sources`, and
 * the 邀请不是命令 recap is a clause on the run's own numbers.
 *
 * Three corrections that were each wrong once, and must stay:
 *  - the per-device power instruction is written into the frame and NOT acted
 *    on; the uploaders answer at their usual power, and that qualification
 *    belongs in the same breath as the claim;
 *  - what a triggered station checks before answering is the NAV, not a clear
 *    channel (mac.ts, `case 'trigger'`);
 *  - a device given a slice keeps its own stream count (`nssForPeer`).
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below, and every figure in the diagram, is pinned in
 * tests/course/ofdma-ul.test.ts.
 */
import { type Lesson, oneRoom, node, sc, firstTrigger, firstMba, J } from '../lessonKit'
import type { SequenceSpec } from '../diagram'

/** The round the figure draws, in µs from the trigger frame's own start. */
export const ROUND = { trigger: 36, gap: 16, answers: 1988.8, mba: 36 }
/** When the answers start, and when the acknowledgement does. */
export const ROUND_AT = {
  answers: ROUND.trigger + ROUND.gap,
  mba: ROUND.trigger + ROUND.gap + ROUND.answers + ROUND.gap,
}

/**
 * One triggered round as an exchange: the access point's two arrows at 0 and at
 * 2057 µs are ONE frame each, naming both uploaders; the two answers start and
 * end in the same instant, side by side in frequency. Read off the constants
 * above, which the test pins against the run.
 */
export function triggeredRound(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-1', label: '上传 A' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-2', label: '上传 B' },
    ],
    messages: [
      { from: 'ap', to: 'sta-1', label: '触发帧', at: '0', tone: 'accent' },
      { from: 'ap', to: 'sta-2', label: '同一帧', tone: 'accent' },
      { from: 'sta-1', to: 'ap', label: '回答 A', at: `${ROUND_AT.answers} µs` },
      { from: 'sta-2', to: 'ap', label: '同时回答' },
      { from: 'ap', to: 'sta-1', label: '一帧确认', at: `${Math.round(ROUND_AT.mba)} µs` },
      { from: 'ap', to: 'sta-2', label: '同一帧' },
    ],
  }
}

export const ofdmaUl: Lesson = {
  id: 'ofdma-ul',
  module: 9,
  title: '触发帧——接入点指挥上行',
  why: '同时发给好几台设备，是一台电台自己就能定的事：它知道自己要发什么，想怎么切信道就怎么切。反过来同时从好几台设备那里收——也就是上行（uplink, UL），从设备指回它们共同说话的那只盒子的方向——则是另一回事。它们得在同一个瞬间开始，落在互不重叠的片上，可谁也听不见别人下一步打算干什么。这就得有人来指挥，而有资格指挥的只有接入点（AP）；它用来指挥的那个帧，就叫作触发帧（Trigger frame）。',
  outcomes: [
    '说出几台设备为什么没法自己商量出一次共享的上行发送',
    '在时间轴上读出一个触发帧，以及它带回来的那些回答',
    '说出一台设备被触发之后，哪些事不再由它决定，哪些事仍然由它决定',
  ],
  needs: ['ofdma-dl'],
  terms: [
    { term: 'uplink', plain: '从设备指向接入点的那个方向；反过来就是下行' },
    { term: 'trigger frame', plain: '接入点发出的一个短帧，用来说明：接下来谁来回答、各用哪一片、回答多长、发多大力' },
    { term: 'TB', plain: '基于触发：TB PPDU 是一种回答帧，设备只有在触发帧点名要求时才被允许发它' },
  ],
  picture: [
    { heading: '难的那个方向', text: '把信道切片，往下行（downlink, DL）方向做得通，因为每一片都是同一台电台填的。往上行方向，各片就要由房间不同角落里的不同设备来填。它们不共用一个时钟，彼此也听不太清，各自只知道自己的队列（queue）。靠它们自己，永远凑不齐同一个起跑瞬间，于是上行只能一台一台地来——除非有人把该做的事原原本本地告诉每一台。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到第一个触发帧：接入点发出的一个短短的黄块。隔一小段，两台上传设备的绿块在同一个瞬间一起开始——又在同一个瞬间一起结束，值得多看两眼的正是这后半句。' },
    {
      kind: 'diagram', heading: '一个回合的形状', spec: triggeredRound(),
      caption: '接入点那两次各是一帧，一帧同时点着两个名字。两个回答落在信道互不重叠的两片上，所以它们同时开始、又被填充（padding）到同一个长度而同时结束——正因为一起结束，一帧块确认（block acknowledgement, BlockAck）就能把整组收掉。',
    },
    { kind: 'list', heading: '触发帧把哪五件事定死了', items: [
      '谁来回答：它点到名的那些设备，别人不许出声。',
      '在哪儿答：每台各用信道的哪一片，好让几个回答并排落下，而不是叠在一起。',
      '答多长：每个回答都填充到同样的长度。',
      '答多响：每台设备都被告知要怎样修正自己的功率，好让近的和远的到达接入点时强弱相近——不过这条指令本仿真器只写进帧里，并不执行，它的两台上传设备仍按自己一贯的功率作答。',
      '什么时候答：触发帧结束后隔一小段，并且在时间和频率上都对齐到接入点。',
    ] },
    { heading: '一个什么都不做主的回答', text: '回来的这一帧叫作基于触发的 PPDU（trigger-based PPDU, TB PPDU）：它是唯一一种“只因为被要求了才可以发”的发送。用哪一片、用哪档调制（modulation）、发多长、什么时候开始，全是接入点定的；设备只负责把字节装进去。诀窍就在这里：要商量出“同时”几乎不可能，要指定“同时”却很容易。' },
    { heading: '设备保住了什么', text: '在一次被触发的回合里，没有人再去数退避（backoff）：这一轮的机会早就分配好了。但设备在作答前仍要过一道关——它看一眼自己的网络分配向量（network allocation vector, NAV），要是此刻正压着一条不是这个接入点设下的预约，它就闭嘴。而在两次回合之间，根本没有谁在指挥：还是那两台上传设备，像以前一样排队、一样竞争，因为接入点只在它想把上行组织一下的时候才发触发帧。' },
  ],
  numbers: [
    { kind: 'table', heading: '两台上传设备 100 ms 内的上行', head: [
      '项目', '次数', '上行字节',
    ], rows: [
      ['接入点发出的触发帧', '16', '—'],
      ['其中没人回答的', '2', '0'],
      ['回来的 TB PPDU', '28', '473,032'],
      ['普通竞争发送', '54', '996,756'],
    ] },
    { heading: '这是邀请，不是命令', text: '这两台设备发上去的东西里，大约三分之一走的是触发回合；其余的走普通竞争的老路，一路上还碰撞了六次。另有两次，触发帧什么也没换回来——接入点只好等到超时，再把空口收回去。' },
    { kind: 'steps', heading: '一次触发回合是怎么安排出来的，一步一步', items: [
      '设备有东西要往上发时，会把这份积压报给接入点；接入点记下“该发触发帧了”，然后开始为自己争一轮。',
      '等它赢下这一轮、而自己手上又没有要往下发的东西时，就列出积压非空、并且和它协商过正交频分多址（orthogonal frequency-division multiple access, OFDMA）的设备。名单上不到两台，这件事就先作罢。',
      '名单上只留前四台，把子载波（sub-carrier）切成同样多的等分资源单元（resource unit, RU），再给整个回合定死一套格式：每台可以用哪一级，以及每个回答占多宽——取受邀各台协商过的最窄的那个宽度。分到一片，并不等于降到单流：每台仍按自己协商的空间流（spatial stream）数作答。',
      '接着为每台设备把积压折算成空口时间（airtime），上限是一个 2 ms 的回答装得下的量，再取其中最长的那个。然后所有设备都被指定这同一个长度，于是几个回答一起结束，一个确认就能把整个回合收掉。',
      '触发帧用 24 Mb/s 慢慢发出去，好让屋里每台设备都读得懂：28 字节是给所有人的公共信息，每点一台名再加 6 字节。它的 Duration 字段把那段间隔、那些回答、第二段间隔和最后的确认一起罩住。',
      '隔 16 µs，被点到名的每台设备各在分给自己的资源单元上作答——除非此刻还有一条不是这个接入点设下的 NAV 压着。它把这个长度容得下的字节装满，剩下的用填充补齐。',
      '几个回答一起结束后再隔 16 µs，接入点发一个多站点块确认（multi-STA BlockAck）把回合收掉：32 字节，此后每多一台设备再加 8 字节。要是触发帧结束后 45 µs 仍没有任何回答开始，这一回合就什么也没换回来，空口随即被收回。',
    ] },
    { kind: 'table', heading: '第一次触发回合，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['有积压的设备', '2'],
      ['每台分到的子载波占比', '0.5'],
      ['一个 2 ms 的回答最多装得下', '17,425 B'],
      ['这么多字节要几个符号（symbol）', '143'],
      ['于是每个回答都被指定为', '44 + 13.6 × 143 = 1988.8 µs'],
      ['每个回答实际装了', '十一帧，16,894 B；余下 531 B 是填充'],
      ['触发帧', '28 + 6 × 2 = 40 B，用 24 Mb/s 发，36 µs'],
      ['多站点块确认', '32 + 8 = 40 B, 36 µs'],
      ['整个回合', '36 + 16 + 1988.8 + 16 + 36 = 2092.8 µs，共上行 33,788 B'],
    ] },
  ],
  deeper: [
    { heading: '一个人的“组”不算组', text: '把两台上传设备中的一台的共享上行能力关掉，这个房间就再也不会发出触发帧了——连为剩下那一台发也不会。引擎的规则很简单：一个触发回合至少要有两个成员，才会被组织起来；道理在开销上——触发帧、那段间隔和那个确认，都得靠分摊它们的成员赚回来。' },
  ],
  sources: [
    '触发帧及其公共信息字段与每用户字段（RU 分配、目标 RSSI、上行长度、MCS）见 IEEE Std 802.11-2024 §9.3.1.22；它所征询的 HE TB PPDU 见第 27 章；“只能用于应答触发帧”这条规则见 §26.5.2。',
    '逐台的功率修正（Target RSSI）在标准里是为了让同时上来的几片强弱相近：一个接收机只有一套增益，某一片过强会把所有片的底噪一起抬高。本仿真器为这个字段计了字节数，却不执行它——它只指定分片、长度、级别和带宽，两台上传设备照自己一贯的功率作答，所以你看到的这个回合是好办的那一种。',
    '用一帧确认整组的多站点 BlockAck 见 §9.3.1.9.7。仿真器给它计 40 字节、36 µs，这是一个代表值，并非按用户逐项相加的结果。',
    '被触发的站点在回答前仍可能被要求先侦听介质，这由触发帧的 CS Required 字段规定（§9.3.1.22.1）；本仿真器把这一条实现为一次 NAV 检查——由这个接入点自己设下的预约不算——并且在触发回合内部从不计退避。',
    '触发帧本身用 24 Mb/s 发送，是仿真器选定的一个房间里人人都能解调的传统速率，并非标准规定的取值。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
    node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
  ]),
  jumps: [
    J('第一个触发帧', firstTrigger),
    J('第一个多站点 BlockAck', firstMba),
  ],
  observe: [
    '跳到第一个触发帧：接入点发出的 36 µs 黄块。隔一小段，两个绿块在同一瞬间开始，而且都长 1988.8 µs——正是触发帧指定的那个长度。',
    '把鼠标分别停在两个绿块上：长度一样，字节数也都是 16,894，可这两台上传设备离得远近不同，队列也不一样。这两个数都不是设备自己定的。',
  ],
  tryThis: [
    '在帧解码器里打开这个触发帧，看它的 Duration 字段：它把后面的回答和确认一起罩住了，于是不在这一组里的设备整个回合都不会上空口。',
    '点“在编辑器中打开”，关掉上传设备 A 的 OFDMA 再重新载入。一个触发帧也不会发出来——连为上传设备 B 发都不会。只有演奏者不止一个，请指挥才划算。',
  ],
  quiz: [
    {
      q: '两台设备为什么没法自己商量着完成一次共享的上行发送？',
      options: [
        '它们的电台没法只在信道的一部分上发射',
        '没有任何东西能给它们一个共同的起始瞬间、一个共同的长度和互不重叠的分片——而且它们也听不见对方的打算',
        '法规禁止两台设备同时发射',
      ],
      answer: 1,
      explain: '在彼此听不见的平等者之间，“同时”是商量不出来的。但它可以由那台谁都听得见的设备指定下来，触发帧干的就是这件事。',
    },
    {
      q: '有一台上传设备排队的东西比另一台少得多。它的 TB PPDU 会是什么样子？',
      options: [
        '更短，于是整个回合结束得更早',
        '长度一样，剩下的部分用填充补齐——几个回答必须一起结束',
        '它根本不被允许回答',
      ],
      answer: 1,
      explain: '触发帧给所有人指定同一个长度。一起结束，才使得一个确认能收掉整组，而填充买的正是这一点。',
    },
  ],
}
