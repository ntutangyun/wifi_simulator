/**
 * Wi-Fi Tier 1 · M2 · Channel access · Hidden nodes & RTS/CTS.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): two
 * stations that cannot hear each other but both reach the access point, why
 * listening first does not save them, and then the short question-and-
 * permission exchange that does. The asymmetry table (what the far station
 * hears of the near one's exchange) and the two variants' collision counts
 * live in `numbers`; the stragglers that survive the cure live in `deeper`.
 *
 * This lesson owns RTS and CTS in the readability programme's owner table, so
 * nav's old "RTS/CTS Duration" material lands here.
 *
 * Every number quoted below is pinned in tests/course/hidden.test.ts. The
 * scenario builder and its variant are unchanged, so the recorded timeline
 * hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 */
import { type Lesson, hallwayHouse, node, sc, firstCollision, J } from '../lessonKit'

export const hidden: Lesson = {
  id: 'hidden',
  module: 1,
  title: '隐藏节点与 RTS/CTS',
  why: '“先听再说”这条规矩，前提是你听得见屋里每一个人。把两台站点（STA）放在房子的两头，接入点（AP）摆在中间的走廊上：两台站点都能轻松够到接入点，却完全听不见对方。于是它们会在同一时刻都判定空口是干净的，两股信号在接入点那里相遇、同归于尽。再多等一会儿也治不了这件事，但“把请求大声说出来”可以。',
  outcomes: [
    '说清为什么两台站点互相听不见时，“先听再说”就失灵了',
    '在时间轴上读出一次碰撞，并说出相撞的是哪两帧',
    '解释一问一答两个小帧，怎么保护得住一个长帧',
    '对比同一场景在关闭与开启该交互时的碰撞次数',
  ],
  needs: ['backoff', 'nav'],
  terms: [
    { term: 'hidden node', plain: '同一个网络里的一台站点，它发的东西你根本听不见，所以你的侦听永远报不出它' },
    { term: 'RTS', plain: '请求发送：长帧之前先发的一个很小的帧，向接收方讨一段空口' },
    { term: 'CTS', plain: '允许发送：接收方回的那个很小的帧，表示“可以”，凡是接收方够得到的人都听得见' },
    { term: 'RTS threshold', plain: '一个帧长门限，超过它的帧要先问一句，而不是直接就发' },
  ],
  picture: [
    { heading: '两个房间，一条走廊', text: '接入点站在走廊上，与两端的房间各隔一堵墙，每个房间里放一台站点。两台站点够到它都毫不费力。可两台站点之间隔着两堵砖墙，传到对方天线（antenna）上的能量，比无线电愿意称之为“信号”的那条线还要低。它们共用一个网络、一条信道，而对方在自己耳朵里根本不存在——这就是隐藏节点（hidden station）：不是安静，是压根听不见。' },
    { heading: '为什么“先听”救不了你', text: '两台站点都严格照章办事：先听，空口干净了才开口。当所有人都听得见所有人时，这就够了。在这里却不够。一台站点的长帧才发到一半，另一台什么也没听见，断定信道是空的，于是开始发送。两帧在接入点处叠在一起——它两边都听得见——于是双双报废。把退避（backoff）窗口开得更大也没用：两者根本看不见彼此，谈何相让。' },
    { kind: 'watch', jump: 0, heading: '看两帧撞在一起', text: '载入仿真，跳到第一次碰撞。从那里往回走：两台站点谁的计数器都没有在对方的帧里冻结过，因为它们根本没有什么可听的。' },
    { heading: '先问一句，让对方大声回答', text: '解法是让接入点替你说话。发长帧之前，站点先发一个很小的帧，讨要一段空口，这就是请求发送（request to send, RTS）。接入点回一个同样小的帧表示“可以”，这就是允许发送（clear to send, CTS）；由于说话的是接入点，两个房间都听得见。这个 CTS 带着一个覆盖本次交互剩余部分的 Duration，于是那台隐藏的站点装上网络分配向量（network allocation vector, NAV），整段时间都安静下来。' },
    { kind: 'watch', heading: '看预约落进另一个房间', text: '切到受保护的那个变体，按播放。盯着远端站点的泳道：一个与它毫无关系的回答传了过来，它下方随即出现一条预约，一直管到这次交互结束。' },
    { heading: '现在撞的是那句“请问”', text: '两台隐藏的站点当然还可能同时开口发问，那时相撞的就是两句“请问”。可一句“请问”只有几十个字节，而一个数据帧（data frame）一千多字节，于是房间损失的只是一闪，而不是一整轮。这就是那笔交易：每个长帧都要为一问一答买单，而剩下那些出岔子的事都很便宜。从多大的帧开始买单，由 RTS 门限（RTS threshold）决定。' },
  ],
  numbers: [
    { kind: 'table', heading: '整场交互里，远端站点听得见什么', head: [
      '帧', '何时', '隔墙', '远端站点的反应',
    ], rows: [
      ['近端站点的 1528 字节数据帧', '1.95 – 2.31 ms', '两堵',
        '径直数了过去——106、105、……66——连它之后的那段间隙也一并数完'],
      ['接入点的 ACK', '2325 – 2353 µs', '一堵',
        '在 64 冻结，熬完 28 µs 的 ACK 和 34 µs 的等待，于 2387 µs 从 64 继续'],
    ] },
    { heading: '一次什么也没守住的冻结', text: '那个回答是本次交互的最后一帧，已经没有什么可预告的了：它的 Duration 是零，任何人都不会因此挂起计时器。片刻之后近端站点开始下一帧，重新“失聪”的远端又径直数了过去。受保护的那个变体补的正是这个洞——在那里接入点先开口，而它预告的是整场尚未开始的交互。' },
    { kind: 'table', heading: '同样的 300 ms，关与开', head: [
      '300 ms 内的统计', '关', '开',
    ], rows: [
      ['碰撞次数', '126', '32'],
      ['其中撞上数据帧的', '126', '7'],
      ['成功送达的数据帧', '45', '329'],
    ] },
    { heading: '这句“请问”的成本与收益', text: '把这套交互打开，撞上数据帧的碰撞减少了约 94%。此后每个长帧开始发送之前，都要先为一个 20 字节的提问和一个 14 字节的回答买单——而整个房间送达的帧数，是不用它们时的七倍。' },
    { kind: 'steps', heading: '一次受保护的交互，一步一步', items: [
      '站点先把要发的那一帧加起来：载荷（payload）、24 字节帧头（MAC header）、4 字节校验。总数高过 RTS 门限——受保护的变体里是 500 字节——它就先问一句。',
      '这句提问是一个 20 字节的 RTS，发给接入点。它的 Duration 字段预约下三个短间隔、那个回答、那一帧数据和确认，起算点是 RTS 结束的那一刻。',
      '这句提问只有听得见这台站点的电台才收得到。它穿过房子到对面时，已低于电台肯认作信号的那条线，于是另一个房间什么也没听见，照旧往下数。',
      '隔 16 µs 之后，接入点回一个 14 字节的 CTS。它的 Duration，是 RTS 讨要的那段时间减去这个间隔、再减去 CTS 自己。回答是从走廊发出的，两头的房间都听得见。',
      '站点收到不是发给自己的帧，就拿这一帧的结束时刻加上帧里的 Duration，把 NAV 设到那里——只要它比手上的 NAV 更晚。远端站点于是把计数器就地冻住。',
      '数据帧与确认帧（ACK）都跑在这段预约里，而预约到期的那一微秒，正是确认帧结束的那一微秒。远端站点等满一个分布式帧间间隔（DIFS），从冻结时的那个数接着数。',
    ] },
    { kind: 'table', heading: '718 µs 那次交互，逐个数值走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['Hidden A 手上那一帧', '1500 + 24 + 4 = 1528 B'],
      ['与门限一比，于是发问于', '718 µs · RTS · 20 B'],
      ['预约的时长，自 RTS 结束起算', '3 × 16 + 28 + 364 + 28 = 468 µs'],
      ['这句提问到 Hidden B 处', '−83.4 dBm < −82 dBm ✗'],
      ['于是接入点回答于', '762 µs · CTS · 14 B'],
      ['它的 Duration', '468 − 16 − 28 = 424 µs'],
      ['这个回答到 Hidden B 处', '−60.6 dBm > −82 dBm ✓'],
      ['Hidden B 在 13 冻结，并预约到', '790 + 424 = 1214 µs'],
      ['确认帧结束于', '1214 µs'],
      ['Hidden B 等一个 DIFS，再从这个数接着数', '1248 µs · 13'],
    ] },
  ],
  deeper: [
    { heading: '治不掉的那几次碰撞', text: '受保护那一轮剩下的 32 次碰撞里，25 次是“请问”撞上“请问”：两台隐藏站点的计数器，在相隔不到四个时隙的时间里先后归零。一句“请问”只有二十字节，所以这种碰撞的代价，只是报废一个数据帧的很小一部分。另外 7 次确实撞上了数据帧——有人开口发问时，那一帧其实已经在路上了。这套办法并没有让介质变安全，它只是让不安全的时刻变短。' },
    { heading: '哪些帧要买单', text: '该变体把 RTS 门限设在 500 字节，而本场景里每个数据帧都是 1528 字节，所以它们全都要先问一句。未受保护的那个场景，就是同一个场景把门限留在 3000——高过屋里任何一帧，于是谁也不会发问。反过来把门限调得极低，则连回答自己都要先发问了——这正是门限总要远高于短帧长度的原因。' },
  ],
  sources: [
    'RTS/CTS 交互，以及“收到其中任何一帧的站点都要按该帧的 Duration 设置 NAV”这条规则，见 IEEE Std 802.11-2024 的 §10.3.2.9 与 §10.3.2.4。',
    'Duration 字段及其含义——从当前帧结束起算、以微秒计的一段时间——见 §9.2.4.2；dot11RTSThreshold 属性见附录 C。',
    '本仿真器把 −82 dBm 以下判为“检测不到”，两堵砖墙及其损耗，以及上面每一个计数和时刻，都是模型取值，靠场景的随机种子即可复现，并非取自标准正文。',
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
    node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
  ]),
  variants: [
    {
      label: '开启 RTS/CTS（门限 500 B）',
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('第一次碰撞', firstCollision),
  ],
  observe: [
    '基础场景：红色的碰撞刻度就没断过——300 ms 里 126 次，而且每一次都夹着一个数据帧。',
    '两台隐藏站点谁也不会为对方冻结：没有一次冻结落在另一个房间发来的帧里。它们的每一次冻结都是为接入点的 ACK 而停——那是对方整场交互里唯一听得见的部分，而它来得比本可保护的那一帧还晚。',
    '受保护变体：接入点一回答，另一个房间的站点就显示出一条一直管到交互结束的预约——300 ms 里有 245 条。',
  ],
  tryThis: [
    '分别统计两个变体每 100 ms 的碰撞刻度（检视器 → BSS 总览）：关闭时约 42 次，开启时约 11 次。',
    '在编辑器里，给走廊的一堵墙靠上端、也就是两台站点连线经过处（y ≈ 7.2）开一扇门。它们之间的射线从此只穿一堵墙，于是又能听见彼此。门开得靠下则毫无作用。',
  ],
  quiz: [
    {
      q: '为什么把竞争窗口（contention window, CW）开大解决不了隐藏节点的碰撞？',
      options: [
        '因为 CW 不能超过它的上限',
        '因为两台站点根本侦听不到彼此，等多久都照样撞进对方的帧里',
        '其实能解决，只是慢',
      ],
      answer: 1,
      explain: '退避计数器只能把“互相听得见”的站点错开。一台你听不见的站点，根本谈不上和你轮流来。',
    },
    {
      q: '真正起作用的为什么是接收方的回答，而不是发送方的提问？',
      options: [
        '它用更大的功率发送',
        '它出自接入点，两台隐藏站点都听得见，而它的 Duration 覆盖了尚未开始的那段交互',
        '它更短，所以不容易被撞上',
      ],
      answer: 1,
      explain: '提问只传得到发送方本来就够得着的人；回答传得到的，恰恰是发送方够不着的那些——而危险正藏在那里。',
    },
  ],
}
