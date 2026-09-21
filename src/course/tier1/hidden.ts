import { type Lesson, N, hallwayHouse, node, sc, firstRts, firstCollision, J } from '../lessonKit'

export const hidden: Lesson = {
  id: 'hidden',
  module: 1,
  title: { en: 'Hidden nodes & RTS/CTS', zh: '隐藏节点与 RTS/CTS' },
  body: [
    { text: {
      en: 'Carrier sense assumes everyone can hear everyone. Put enough brick between two stations and that breaks: here A and B sit in opposite rooms, their signals crossing two walls of a hallway and arriving below the −82 dBm detection threshold — pure noise to each other.',
      zh: '载波侦听默认所有人都能互相听见。在两台终端之间隔上足够多的砖墙，这个假设就碎了：本场景中 A 和 B 分处两端的房间，信号要穿过走廊的两堵墙，到达对方时已低于 −82 dBm 的检测门限——彼此听来只是噪声。',
    } },
    { text: {
      en: 'Each senses an idle channel while the other is mid-frame, and their transmissions meet — and die — at the AP in the hallway, which hears both. This is the hidden-node problem, and no amount of backoff fixes it, because the contenders never see each other contend.',
      zh: '于是一方正在发帧，另一方却侦听到“空闲”，两股信号在走廊里的 AP 处相遇、同归于尽——AP 两边都听得到。这就是隐藏节点问题——多少退避都治不了它，因为竞争双方根本看不见彼此在竞争。',
    } },
    { heading: { en: 'B freezes for the receipt, not the payload', zh: 'B 为回执停步，却听不见正文' }, text: {
      en: 'Around t ≈ 2.3 ms you can watch the asymmetry directly. Of A’s entire exchange, the only fragment B ever perceives is the 28 µs receipt at the end:',
      zh: '在 t ≈ 2.3 ms 附近可以直接看到这种不对称。A 的整场交换里，B 能感知到的唯一片段，就是结尾这张 28 µs 的回执：',
    } },
    { kind: 'table', head: [
      { en: 'Frame', zh: '帧' }, { en: 'Time', zh: '时间' }, { en: 'Walls from B', zh: '与 B 之间的墙' }, { en: 'What B does', zh: 'B 的反应' },
    ], rows: [
      [{ en: 'A’s 1528 B data', zh: 'A 的 1528 B 数据帧' }, N('≈ 1.95–2.31 ms'), { en: 'Two', zh: '两堵' }, { en: 'Counts straight through it — 106, 105, … 66 — as if the channel were empty, and on through the SIFS gap after it.', zh: '倒数径直穿过它——106、105、……66——仿佛信道空无一物，并且接着数过它之后的 SIFS 间隙。' }],
      [{ en: 'AP’s ACK', zh: 'AP 的 ACK' }, N('2325–2353 µs'), { en: 'One', zh: '一堵' }, { en: 'Freezes at 64, sits out the 28 µs ACK plus a 34 µs DIFS, resumes at 64.', zh: '冻结在 64，等完 28 µs 的 ACK 加 34 µs 的 DIFS，再从 64 继续。' }],
    ] },
    { text: {
      en: 'And that freeze protects nothing: a final ACK carries Duration = 0, so it sets no NAV — moments later A starts its next frame and B, deaf again, counts right through it. This is exactly the gap the CTS closes: it too comes from the AP, audible to B, but it carries a nonzero Duration covering the whole upcoming data frame — turning B’s 28 µs twitch into a reservation that lasts the entire exchange.',
      zh: '而且这次冻结保护不了任何东西：收尾 ACK 的 Duration = 0，不设任何 NAV——片刻之后 A 的下一帧开始，重新“失聪”的 B 又径直数了过去。这正是 CTS 补上的缺口：CTS 同样来自 AP、B 也听得见，但它带着覆盖整个后续数据帧的非零 Duration——把 B 那 28 µs 的一哆嗦，变成一场贯穿整次交换的预约。',
    } },
    { kind: 'steps', heading: { en: 'The cure: let the AP announce the reservation', zh: '解法：让 AP 来宣布预约' }, items: [
      { en: 'The station sends a short RTS.', zh: '终端先发一个很短的 RTS。' },
      { en: 'The AP answers CTS — audible to both rooms — and the CTS sets everyone’s NAV.', zh: 'AP 回一个 CTS——两个房间都听得到——于是所有人的 NAV 都被设置。' },
      { en: 'Now it is almost always the tiny RTS that collides instead of a long data frame. In this scene data collisions drop by about 95%; a few stragglers remain where a data frame meets an RTS.', zh: '此后碰撞的几乎总是小小的 RTS，而不再是长长的数据帧。本场景中数据帧碰撞减少约 95%，剩下的零星几次是数据帧撞上 RTS。' },
    ] },
    { text: {
      en: 'Compare the two variants below.',
      zh: '对比下面两个场景变体。',
    } },
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
    node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
  ]),
  variants: [
    {
      label: { en: 'RTS/CTS ON (threshold 500 B)', zh: '开启 RTS/CTS（门限 500 B）' },
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('first collision', '第一次碰撞', firstCollision),
    J('first RTS', '第一个 RTS', firstRts),
  ],
  observe: [
    { en: 'Base scenario: stations transmit straight through each other’s frames — the red collision ticks pile up.', zh: '基础场景：两台终端径直在对方的帧中间开始发送——红色碰撞刻度不断累积。' },
    { en: 'Neither hidden station ever freezes its backoff for the other: they cannot hear each other at all.', zh: '两台隐藏终端的退避从不因对方而冻结：它们完全听不到彼此。' },
    { en: 'Each station does freeze for the AP’s ACKs — the only audible fragment of the other’s exchange.', zh: '但每台终端都会为 AP 的 ACK 冻结——那是对方整场交换中它唯一听得见的片段。' },
    { en: 'RTS variant: after a CTS, the other room’s station shows NAV and waits — data-frame collisions all but vanish.', zh: 'RTS 变体：CTS 之后另一个房间的终端出现 NAV 并等待——数据帧碰撞几乎绝迹。' },
  ],
  tryThis: [
    { en: 'Count COLLISION ticks per 100 ms in both variants (inspector → BSS totals).', zh: '分别统计两个变体每 100 ms 的碰撞数（检视器 → BSS 总览）。' },
    { en: 'In the editor, punch a door near the top of a hallway wall, on the stations’ line of sight (y ≈ 7.2) — the ray between them now crosses only one wall, and they start hearing each other again. A door elsewhere changes nothing: RF “holes” only matter if the straight path passes through them.', zh: '在编辑器里给走廊的一堵墙靠上端、也就是两台终端连线经过处（y ≈ 7.2）开一扇门——它们之间的射线只剩一堵墙，于是又能听到彼此。门开在别处则毫无作用：射频“孔洞”只有在直线路径恰好穿过时才起作用。' },
  ],
  quiz: [
    {
      q: { en: 'Why doesn’t CW doubling solve hidden-node collisions?', zh: '为什么 CW 翻倍解决不了隐藏节点碰撞？' },
      options: [
        { en: 'CW cannot exceed 1023', zh: '因为 CW 不能超过 1023' },
        { en: 'The stations never sense each other, so they keep transmitting into each other’s frames regardless of backoff', zh: '双方根本侦听不到彼此，不管怎么退避都会撞进对方的帧里' },
        { en: 'It does solve it, just slowly', zh: '其实能解决，只是慢' },
      ],
      answer: 1,
      explain: { en: 'Backoff only avoids collisions among stations that can hear each other’s transmissions.', zh: '退避只能避免“互相听得见”的终端之间的碰撞。' },
    },
    {
      q: { en: 'What makes CTS effective against hidden nodes?', zh: 'CTS 为什么能治隐藏节点？' },
      options: [
        { en: 'It is transmitted at higher power', zh: '它用更大的功率发送' },
        { en: 'It comes from the AP, which both hidden stations can hear — its Duration sets their NAVs', zh: '它由 AP 发出，两台隐藏终端都听得到——其 Duration 字段设置了它们的 NAV' },
        { en: 'It encrypts the channel', zh: '它对信道加密' },
      ],
      answer: 1,
      explain: { en: 'The receiver-side reservation is audible where the transmitter is not (§10.3.2.9).', zh: '接收方的预约在发送方听不到的地方也能被听到（§10.3.2.9）。' },
    },
  ],
}
