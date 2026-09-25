/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · OFDMA on the downlink.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * §2 M10): the lesson stays whole — one topic, one procedure, one scene — and
 * loses the paragraph that narrated the preamble accounting, because the
 * `fields` figure of the MU PPDU now draws it (§4). What it must never claim is
 * a throughput win: with this fixed video load the frames delivered are
 * identical with OFDMA and without, and the whole gain is 1.44 ms of air over
 * 300 ms.
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below — and every figure in the diagram — is pinned in
 * tests/course/ofdma-dl.test.ts.
 */
import { type Lesson, oneRoom, node, sc, txOf, firstMuDl, J } from '../lessonKit'
import type { FieldsSpec } from '../diagram'
import { PHY_MODES } from '../../engine/phy'

/** The symbols each half-channel member of the run's MU PPDU needs for its 1434 B. */
export const MU_SYMBOLS = 12

/** µs, one decimal — the unit the timeline and the tables print. */
const us = (ns: number): number => Math.round(ns / 100) / 10

/**
 * One multi-user PPDU of this run, drawn from the PHY's own constants: the
 * preamble, the per-user map that is the price of the whole idea, and the two
 * members' payload. Sized in microseconds, so the boxes are the picture of
 * where the 211.2 µs goes — and a PHY change moves the figure with the lesson.
 */
export function muPpduFields(): FieldsSpec {
  const m = PHY_MODES.he
  const payloadNs = m.symNs * MU_SYMBOLS
  return {
    kind: 'fields',
    fields: [
      { label: '前导码', size: us(m.preambleNs) },
      { label: '每用户分配表', size: us(m.muExtraPreambleNs) },
      { label: '各 RU 的载荷', size: us(payloadNs) },
    ],
    unit: 'µs',
    total: `共 ${us(m.preambleNs + m.muExtraPreambleNs + payloadNs)} µs`,
  }
}

export const ofdmaDl: Lesson = {
  id: 'ofdma-dl',
  module: 9,
  title: 'OFDMA 下行——一次发送，好几台设备',
  why: '一台正在放片子的电视，每次并不需要占多少空口，但它需要一个“轮次”：自己的前导码（preamble）、自己的回执，之前还要自己等一轮。同一个房间里放三台，接入点（AP）整晚花在这些包装上的工夫，就多过花在片子上。这一课要看的是：接入点如何不再一轮只服务一台设备，而是在一次发送里同时服务好几台。',
  outcomes: [
    '说出接入点在一次发送里服务多台设备时，被切分的到底是什么',
    '在时间轴上读出一次多用户（multi-user, MU）发送：里面有谁、花了多久、怎么被确认的',
    '说出把信道切成小片什么时候省空口，什么时候一点也省不下',
  ],
  needs: ['width', 'txop'],
  terms: [
    { term: 'OFDMA', plain: '正交频分多址：把一条信道切成几片，让一次发送能同时装着发给好几台设备的数据' },
    { term: 'resource unit', plain: '资源单元：一次发送里分给某一台设备的那一组子载波，也就是切出来的一片' },
    { term: 'RU', plain: '资源单元的简称，也是仿真记录里印出来的那个名字' },
    { term: 'MU', plain: '多用户：形容一次发送里的各个分片分别属于不同的设备' },
  ],
  picture: [
    { heading: '一次发送，切成几片', text: '信道本来就是一根根很窄的子载波（sub-carrier）拼起来的，而且谁也没规定它们必须都为同一段对话服务。换个分法：把它们成块地分出去——这一块给那部手机，那一块给电视——于是一次发送就能同时装着发给好几台设备的载荷（payload）。每台设备只读属于自己的那一块，其余的一概不管。这就是正交频分多址（orthogonal frequency-division multiple access, OFDMA），而其中的一块，就是一个资源单元（resource unit, RU）。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到第一次多用户发送。把鼠标停在那个宽蓝块上：一帧里点着两台电视的名字。它结束之后隔一小段，两个回执在同一个瞬间一起开始，并排落在不同的泳道上。' },
    { heading: '谁来决定怎么切', text: '切片不是谈出来的。赢下这一轮之后，由接入点一个人决定：它看一眼此刻有哪些设备的东西正等着发，最多挑四台，给每台分一个同样大的资源单元（RU），然后发出去。没被挑中的设备不是被拒绝了——只是它们的队列（queue）里此刻根本没有东西可装。发出去的这一帧，记录里叫作多用户 PPDU（multi-user PPDU, MU PPDU），它的开头比平常多带一张每用户分配表（per-user info field），写明哪一片属于谁。' },
    {
      kind: 'diagram', heading: '这一发的时间花在哪儿', spec: muPpduFields(),
      caption: '两台电视各装 1434 字节，各占半条信道，所以各要十二个符号（symbol）。而前导码和那张分配表，整组只付一次——省下来的就是这一笔，成员越多越划算，道理也就在这里。',
    },
    { heading: '切片买不来的东西', text: '切片不会让任何一条链路（link）变快。电视要多少片子就是多少，它收到的帧和本来会收到的一模一样；省下来的是空口时间（airtime），而省下的这点属于房间里其他想说话的人。接入点也没法把队列是空的设备凑成一组：必须有两台设备在同一瞬间都有东西等着发，而在一屋子平稳的视频流里，这样的瞬间并不多。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样两个视频帧发给 Wi-Fi 6 电视，两种发法', head: [
      '发法', '前导码', '每帧数据符号',
      '占用空口', '回执',
    ], rows: [
      ['一帧一帧发', '44 µs × 2', '6 + 6', '125.6 µs × 2',
        '两个确认帧（acknowledgement, ACK），各 28 µs，一前一后'],
      ['一个 MU PPDU', '48 µs', '12', '211.2 µs',
        '两个块确认帧，各 32 µs，同一瞬间'],
    ] },
    { kind: 'formula', heading: '为什么是十二个符号而不是六个', text: '符号数 = ⌈(16 + 8·字节数 + 6) ÷ (每符号比特数 × RU 占比)⌉', note: '子载波少一半，符号数就翻一倍。即便如此，两帧一起走只要 211.2 µs，而一前一后地发要 251.2 µs。' },
    { kind: 'table', heading: '整段仿真：三台电视，300 ms', head: [
      '测量项', '开 OFDMA', '关 OFDMA',
    ], rows: [
      ['接入点向下发送的次数', '1016', '1061'],
      ['其中装着两台电视的', '45', '0'],
      ['电视 1 / 2 / 3 收到的帧数',
        '352 / 355 / 354', '352 / 355 / 354'],
      ['每台电视每秒收到的片子',
        '13.1 / 13.3 / 13.2 Mb/s', '13.1 / 13.3 / 13.2 Mb/s'],
      ['空口忙碌的总时间', '161.5 ms', '163.0 ms'],
    ] },
    { heading: '同样的片子，更少的空口', text: '每台电视收到的帧和原来一模一样，所以屏幕上什么也不会变。变的是空口：每凑成一对，就省下 40 µs 的前导码，又因为回执变大而还回去 8 µs；这段仿真里的 45 对，合起来是 1.44 ms，还给了房间里其他所有人。' },
    { kind: 'steps', heading: '一次多用户发送是怎么攒出来的，一步一步', items: [
      '接入点赢下一轮，先列出此刻队列里有东西、并且和它协商过 OFDMA 的设备。名单上不到两台，它就走老路，只发给一台。',
      '名单上只留前四台，再把子载波切成同样多的等分资源单元：两个成员就一人一半，三个成员就一人三分之一。',
      '接着为每个成员算出一个符号能驮多少比特：先取它那一级在 20 MHz 信道、单流下的比特数——这几台电视是 1950——再乘上它分到的子载波占比，这里正好折半，得到 975。',
      '然后从这台设备的队列里往它那一份里装，并数出符号数：⌈(16 + 8 × 字节数 + 6) ÷ 每符号比特数⌉。要是某个成员连第一帧都塞不进这一轮，就把它整个去掉。',
      '整次发送的长度，取最长的那个成员所需的长度：44 µs 前导码，再加 4 µs 装“这一发里有谁”的分配表，然后每个符号 13.6 µs。',
      '结束后隔 16 µs，每个成员各在自己的资源单元上回一个 32 µs 的块确认（block acknowledgement, BlockAck），全都落在同一瞬间。只要有一个成员答了，这次交互就算成，其余成员那一份重新排队。',
    ] },
    { kind: 'table', heading: '第一次多用户发送，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['此刻队列里有东西的设备', '2'],
      ['每个成员分到的子载波占比', '0.5'],
      ['每个成员每符号比特数', '1950 × 0.5 = 975'],
      ['每个成员装进去的字节', '1434 B'],
      ['每个成员的符号数', '⌈11494 ÷ 975⌉ = 12'],
      ['于是这次发送的长度是', '44 + 4 + 13.6 × 12 = 211.2 µs'],
      ['16 µs 之后回来的确认是', '2 × 32 µs'],
    ] },
  ],
  deeper: [
    { heading: '为什么一组是两台而不是三台', text: '引擎一组最多收四个成员，这里的三台电视其实都塞得下——再加一个成员，无非是每片从半条信道变成三分之一条。可它从来没发生过：平稳的视频流发一帧、等一会儿，于是在接入点恰好赢下这一轮的那个瞬间，第三条队列非空的概率很小。分组是见机行事的，而机会在队列里，不在电台里。' },
    { heading: '那张分配表里装的是什么', text: '单用户发送的前导码是 44 µs，多用户是 48 µs，差出来的这一段就是每用户分配表：哪个资源单元属于哪台设备、每一片用的是哪一档调制。没有它，接收端就不知道该去读信道的哪一段，所以这张表是整个想法的价钱，而且是一口价。' },
  ],
  sources: [
    '下行 OFDMA 的 PPDU、其每用户字段与资源单元尺寸，出自 IEEE Std 802.11-2024 第 27 章（802.11ax 的 HE PPDU）；本房间里的电视是 Wi-Fi 6 站点，所以接入点发的是 HE MU PPDU，而不是 802.11be 的那种。',
    '44 µs 的前导码、多用户信令多出的 4 µs 以及 13.6 µs 的符号，是本仿真器为这类 PPDU 取的单一代表值，并非逐字段相加；它们代入的空口时间公式是 §17.4.3 的 TXTIME。',
    '确认帧同时返回，在标准里是被征询的响应：接入点用 Trigger 帧、或用各站点自己那一片里携带的 TRS 字段发起征询，站点以基于触发的 PPDU 返回（第 26.5 节）。仿真器把它们画成各站点自己那一片上的 BlockAck，并按同样的空口时间计费。',
    '“一组最多四个成员”是本引擎自己的限制（mac.ts 里的 `muDsts.slice(0, 4)`），不是标准的规定：802.11ax 允许的成员数远不止于此，资源单元最小可到 26 个子载波。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
    node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
    node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  jumps: [
    J('第一次多用户发送', firstMuDl),
    J('同时发出的 BlockAck', txOf((r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup !== undefined)),
  ],
  observe: [
    '跳到第一次多用户发送。那个宽蓝块长 211.2 µs，为两台电视各装了 1434 字节；第三台不在里面，因为那个瞬间没有东西在等着发给它。',
    '隔一小段之后，两个 32 µs 的回执在不同泳道的同一瞬间开始，各自在自己那片信道上作答。整段仿真里接入点向下发了 1016 次，其中只有 45 次装着两台电视。',
  ],
  tryThis: [
    '点“在编辑器中打开”，关掉电视 1 的 OFDMA。它立刻退出所有分组：另外两台照样凑成一组，整段仿真里凑了 11 次，而电视 1 从此只被单独服务。',
    '把四台设备的 OFDMA 全部关掉再重新载入。现在每次发送只服务一台电视，共 1061 次，每台电视收到的东西和原来分毫不差，而整段仿真里空口多忙了 1.44 ms。',
  ],
  quiz: [
    {
      q: '两个回执在同一瞬间开始。它们为什么不会碰撞？',
      options: [
        '它们足够短，能互相挤过去',
        '各自在自己的资源单元上作答，于是它们在频率上并排，而不是叠在一起',
        '接入点事后把干扰消掉了',
      ],
      answer: 1,
      explain: 'OFDMA 分的是频率而不是时间。落在信道不同片上的两次传输互不干扰，回执之所以能同时发出，原因正在这里。',
    },
    {
      q: '开了 OFDMA 之后，每台电视收到的帧和不开时完全一样。那么 OFDMA 究竟买到了什么？',
      options: [
        '什么也没买到——分组只在上行（uplink, UL）才有意义',
        '空口：同样的片子用更少的发送时间送到了，省下的时间留给了其他所有人',
        '每台电视的速率更高了',
      ],
      answer: 1,
      explain: '平稳的视频流要多少就是多少，分组不可能多送。它做的是用更少的包装送同样多的东西——这里是在 300 ms 内还回去 1.44 ms 的空口。',
    },
  ],
}
