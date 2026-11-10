/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · A tag with no battery.
 *
 * Standard-first since 2026-11-11 (the shape `@uwb-contention` set): ① what the P802.11bp
 * documents say about one Active Tx polling round — who may transmit, what the AMP triggering
 * frame announces, how a tag draws its slot and how the Acks time the slots — each point with
 * the document and motion it comes from and whether TGbp adopted it; ② what this simulator does
 * about each, including the two places it departs (the round is exempt from the AC_BK TXOP
 * limit; the CTS-to-self in front of it is the simulator's own choice); ③ three guided runs.
 *
 * One Wi-Fi 7 router polls two battery-free tags every 100 ms in 2.4 GHz. The frame's own
 * anatomy is the next lesson, `amp-ppdu`, which loads this same scene. Every figure quoted below
 * is read back out of this file and compared with a run in tests/course/amp-intro.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, ampAp, firstAmpAckToTag, firstAmpLost, firstAmpResp, firstAmpTrigger, oneRoom, sc, tag, txOf, type Lesson } from '../lessonKit'

/** The lab: the router and its two tags, at the chosen AMP data rates. */
export function ampIntroScenario(rates: { dlKbps: 250 | 1000; ulKbps: 250 | 1000 }): Scenario {
  return sc(oneRoom(), [
    ampAp('ap', 'Router', 5, 4, rates),
    tag('tag-1', 'Fridge tag', 3, 4),
    tag('tag-2', 'Door tag', 8, 6),
  ])
}

export const ampIntro: Lesson = {
  id: 'amp-intro',
  module: 10,
  title: '没有电池的标签',
  why: 'IEEE P802.11bp 仍是草案。它为只依靠环境射频能量工作的设备定义了一种自行发射、不作为接入点（access point, AP）的站点（station, STA）——Active Tx non-AP AMP STA，本课称为标签：标签没有载波侦听（carrier sense），也不退避（backoff），只有在 AMP 接入点用一帧 AMP 触发帧（Trigger frame）征求时才发送。触发帧给出时隙数、时隙长度和窗口指数 ACWE；每个收到它的标签在 0 到 2^ACWE − 1 之间均匀随机取一个数 ABOC，在第 ABOC + 1 个时隙作答，取到的数不小于时隙数就不作答。第 1 个时隙在触发帧结束后一个 AMP 短帧间间隔（short interframe space, SIFS），即 10 µs 之后开始；从第 2 个时隙起，每个时隙都由接入点发出的一帧 AMP Ack 标出起点，这帧 Ack 同时写明上一个时隙里收到的是谁，没有收到时写接入点自己的标识。接入点按 PAR 的规定以 AC_BK 通过增强型分布式信道接入（EDCA）取得信道。这几条来自两份已获 TGbp 通过、将并入下一版草案的草案文本（PDT）。本仿真器照此实现，另有两处是它自己的做法：每一轮之前加一帧写给自己的允许发送（clear to send, CTS），即 CTS-to-self（CTS to self），以及整轮不受 AC_BK 的传输机会（TXOP）限制——250 kb/s 下一轮长 4190 µs，超过 2.4 GHz 下 AC_BK 缺省的 2.528 ms。本课场景里的读数丢失全部来自两个标签选中同一个时隙。',
  outcomes: [
    '说出草案对标签发送的限制：只在触发帧分配的时隙里发送',
    '按草案说出一轮轮询的步骤：触发帧、抽取 ABOC、时隙、AMP Ack',
    '分清本仿真器的哪些做法照草案、哪些是它自己的取法',
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'AMP', plain: '环境能量（ambient power）：P802.11bp 为只依靠收集的环境能量工作的设备定义的功能' },
    { term: 'tag', plain: '标签：本课对 Active Tx non-AP AMP STA 的简称，即自己能发射、但只在被征求时发送的无电池终端' },
    { term: 'slot', plain: '时隙：触发帧之后一段等长的时间窗口，只容纳一次作答' },
    { term: 'ABOC', plain: 'AMP 退避计数器（AMP backoff counter）：标签在 0 到 ACW 之间随机取的数，决定在第几个时隙作答' },
  ],
  standard: [
    { heading: '草案的状态与依据（11-25/1692r50）', text: 'IEEE P802.11bp 仍是草案，草案正文只对 802.11 成员开放。本课依据的是公开的 TGbp 文件：规范框架 11-24/1613r20（已通过的动议），以及两份以 D0.5 为基线的草案文本——11-26/1519r5（39.3 节，AMP 触发过程）与 11-26/1889r4（39.4 节，非 AP AMP STA 的信道接入）。TGbp 在 2026 年 9 月会议上以意向投票 #87 与 #90 无异议同意把这两份文本并入下一版草案。' },
    { heading: '谁可以发送（规范框架 AM-2、PM-2；11-26/1889r4 §39.4）', text: '草案定义了三类非 AP AMP STA：反向散射的、自行发射的（Active Tx）和能接收 AMP 帧的普通 Wi-Fi 终端（动议 #29）。自行发射的终端时钟精度要求放宽，而且只能在被接入点轮询时发送（动议 #14）。39.4 节把这一条写成规则：除非 AMP 接入点按 39.3 节征求，非 AP AMP STA 不得自行接入信道。' },
    { heading: '接入点怎样取得信道（PAR，见 11-26/1582r3）', text: 'P802.11bp 的项目授权书（PAR）规定，2.4 GHz 的数据通信至少有一种模式把 AMP 通信的接入类别（access category, AC）设为 AC_BK。接入点因此和其他发送一样经 EDCA 竞争，使用四个接入类别中最低的一个。' },
    { heading: '触发帧宣布什么（11-26/1519r5 §39.3.2.1）', text: '征求自行发射终端作答的 AMP 触发帧必须给出：信道指示（接入点主 20 MHz 信道的编号）、上行（uplink, UL）速率、扰码种子编号、时隙数、时隙长度和所征求的作答内容。用于随机接入的广播触发帧还要给出会话号和 ACWE，ACW = 2^ACWE − 1。时隙数大于 1 时，各时隙等长（动议 #187）。' },
    { heading: '标签怎样选时隙（11-26/1889r4 §39.4；规范框架 MM-45）', text: '收到随机接入的触发帧、准备作答的标签，在整数区间 [0, ACW] 里均匀随机取一个新的 ABOC。ABOC 小于时隙数时，它可以在第 ABOC + 1 个时隙发送；否则这一帧触发帧它不作答。时隙从 1 开始编号。重传（retry）时怎样选 ABOC，规范框架仍标为待定（动议 #224）。' },
    { heading: '时隙的起点（11-26/1889r4 §39.4；规范框架 MM-7、MM-46、PM-96）', text: '标签以触发帧所在 PPDU（PHY protocol data unit）最后一个符号（symbol）的结束时刻为基准，第 1 个时隙在其后一个 AMP SIFS 开始；2.4 GHz 的 aSIFSTime 为 10 µs（动议 #212）。一次传输机会里有多个时隙时，接入点必须发一帧 AMP Ack 标出第 2 个及以后每个时隙的起点，轮到这个时隙的标签在这帧 Ack 结束后一个 AMP SIFS 发送（动议 #247）。' },
    { heading: 'AMP Ack 写谁（11-26/1519r5 §39.3.2.2）', text: '标出时隙起点的 AMP Ack 与触发帧用同一速率发送，各帧时长相同。接入点在一个时隙里收到了作答，就把紧随其后的 Ack 的 ID 字段设为作答者的标识；在不是最后一个的时隙里什么也没收到，就设为接入点自己的标识。规范框架的动议 #248 原先写的是广播标识，这份草案文本改成了接入点自己的标识。' },
    { kind: 'steps', heading: '一轮随机接入，按草案：逐步说明', items: [
      '接入点以 AC_BK 经 EDCA 取得传输机会（PAR）。',
      '接入点发出广播的 AMP 触发帧，给出时隙数 N、时隙长度、ACWE 与会话号（§39.3.2.1）。',
      '每个准备作答的标签在 [0, 2^ACWE − 1] 里均匀随机取 ABOC；ABOC < N 时在第 ABOC + 1 个时隙作答，否则不作答（§39.4）。',
      '第 1 个时隙在触发帧结束后一个 AMP SIFS 开始（§39.4）。',
      '每个时隙结束后，接入点发一帧 AMP Ack：收到了谁就写谁，没收到就写自己；它同时标出下一个时隙的起点（§39.3.2.2，动议 #247）。',
      '两个标签选中同一个时隙时可能互相干扰；接收机怎样判决，草案不规定。',
    ] },
    { heading: '与 802.11 本身有关的两条（IEEE Std 802.11-2024）', text: 'CTS-to-self 是接收地址等于发送者自己地址的 CTS 帧（§9.3.1.3），用来向其他设备分发网络分配向量（network allocation vector, NAV）（§10.3.2.15），它的 Duration 覆盖其后的发送再加一个 SIFS（§9.2.5.2）。TXOP 持有者必须保证一次传输机会不超过 TXOP 限制（§10.23.2.9）；表 9-194 给出第 17—19 章物理层（physical layer, PHY）下 AC_BK 的缺省限制 2.528 ms。草案只对双基地反向散射要求在征求上行之前先发保护帧（规范框架 FM-48，动议 #250），对自行发射的终端没有这一要求。' },
  ],
  implementation: [
    { topic: '标签何时发送', standard: '只在触发帧分配的时隙里发送；不得自行接入信道（§39.4，动议 #14）', sim: '标签没有载波侦听、没有退避，也不设网络分配向量；它只在解出触发帧之后、在自己选中的时隙里发送一次。', kind: 'faithful' },
    { topic: '接入点取得信道', standard: 'AC_BK，经 EDCA（PAR）', sim: '轮询时钟每 100 ms 请求一次 AC_BK 的传输机会；一轮完成后按一次成功的帧交换把 AC_BK 的竞争窗口（contention window, CW）恢复到最小值。', kind: 'faithful' },
    { topic: '一轮的长度', standard: '一次传输机会不得超过 TXOP 限制；AC_BK 缺省 2.528 ms（§10.23.2.9，表 9-194）', sim: '整轮不受 TXOP 限制约束：250 kb/s 下一轮从 CTS-to-self 起长 4190 µs，超过 2.528 ms。本课依据的草案文件没有为 AMP 轮另立例外。', kind: 'differs' },
    { topic: '轮前的保护', standard: '对自行发射的终端不要求（规范框架 FM-48 只针对双基地反向散射）', sim: '每一轮先发一帧 CTS-to-self，Duration 覆盖整轮再加一个 SIFS；场景可以关掉它。', kind: 'choice' },
    { topic: 'ABOC 与时隙', standard: '在 [0, 2^ACWE − 1] 均匀取 ABOC，ABOC < N 时在第 ABOC + 1 个时隙发送（§39.4）', sim: '照此实现。本课 ACWE = 2、N = 4，所以 0 到 3 每个取值都对应一个时隙，两个标签每一轮都作答。', kind: 'faithful' },
    { topic: '时隙的起点', standard: '第 1 个时隙在触发帧后一个 AMP SIFS；其后每个时隙在 AMP Ack 后一个 AMP SIFS（§39.4，动议 #247）', sim: '照此实现，AMP SIFS 取 10 µs。标签按收到的 Ack 计数，数到第 ABOC 帧就在其后作答，自己不计时。', kind: 'faithful' },
    { topic: 'AMP Ack 的 ID', standard: '收到了谁写谁；不是最后一个时隙且没收到时写接入点自己（§39.3.2.2）', sim: '照此实现；同一速率，各帧时长相同。', kind: 'faithful' },
    { topic: '最后一个时隙之后', standard: '最后一个时隙没收到作答时发不发 Ack，草案文本没有规定', sim: '每个时隙之后都发一帧 Ack，最后一个时隙空着时也发，写接入点自己。', kind: 'choice' },
    { topic: '信道指示、频移与扰码', standard: '触发帧给出主 20 MHz 信道编号、上行频移与扰码种子编号（§39.3.2.1、§39.3.2.2）', sim: '这些字段不起作用：标签总在接入点所在的信道上作答，不做频移，也不建模扰码。', kind: 'absent' },
    { topic: '接收门限', standard: '标签的下行（downlink, DL）灵敏度（sensitivity）与通断键控的信干噪比（signal-to-interference-plus-noise ratio, SINR）门限，草案未给出', sim: '标签下行灵敏度 −72 dBm；通断键控的信干噪比门限下行 8 dB、250 kb/s 上行 10 dB；接入点接收 250 kb/s 作答约 −94 dBm。', kind: 'value' },
    { topic: '两路作答相叠', standard: '草案不规定接收机的判决', sim: '同时到达的两路作答，较强一路的信干噪比达到门限（250 kb/s 上行 10 dB）才能解出；后到的一路要比已锁定的一路强 5 dB 以上、且落在上行 AMP-Sync 之内，接收机才改锁。', kind: 'value' },
  ],
  labs: [
    {
      heading: '一轮轮询，逐微秒',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一帧 AMP 触发帧，把时间条放大到能看清几十微秒。',
        '对照下表读出路由器泳道上第一轮的每一帧与每个时隙。',
      ],
      blocks: [
        { kind: 'table', heading: '路由器泳道上的第一轮', head: ['内容', '起', '止'], rows: [
          ['CTS-to-self，Duration 4140 µs', '0 µs', '50 µs'],
          ['AMP 触发帧，4 个时隙 × 528 µs', '60 µs', '678 µs'],
          ['时隙 1：Door tag', '688 µs', '1216 µs'],
          ['第 1 帧 Ack → Door tag', '1226 µs', '1556 µs'],
          ['时隙 2：Fridge tag', '1566 µs', '2094 µs'],
          ['第 2 帧 Ack → Fridge tag', '2104 µs', '2434 µs'],
          ['时隙 3：无人', '2444 µs', '2972 µs'],
          ['第 3 帧 Ack → 路由器', '2982 µs', '3312 µs'],
          ['时隙 4：无人', '3322 µs', '3850 µs'],
          ['第 4 帧 Ack → 路由器', '3860 µs', '4190 µs'],
        ] },
      ],
      expect: '时隙 1 在触发帧结束后 10 µs 开始（678 + 10 = 688 µs），时隙 2 在第 1 帧 Ack 结束后 10 µs 开始（1556 + 10 = 1566 µs）；两个空时隙之后同样各有一帧 Ack，写的是路由器自己。CTS-to-self 在 50 µs 结束，它的 Duration 到 4190 µs 为止，正是第 4 帧 Ack 结束的时刻。',
      meaning: '时隙起点与 Ack 的写法照草案（①）；CTS-to-self 与最后一帧 Ack 是本仿真器自己的做法（②）。',
    },
    {
      heading: '读数为什么丢失',
      jump: 4,
      steps: [
        '跳到第一次丢失的作答，看路由器在那个时隙末尾发出的 Ack 写的是谁。',
        '运行满一秒，对照下表读出十轮里的两次碰撞。',
      ],
      blocks: [
        { kind: 'table', heading: '一秒十轮里的两次碰撞', head: ['轮次', '时隙', '碰撞于', 'Ack 标明', '标签得知'], rows: [
          ['3', '1', '201 216 µs', '路由器自己', '201 556 µs'],
          ['6', '3', '502 972 µs', '路由器自己', '503 312 µs'],
        ] },
      ],
      expect: '一秒钟十轮，40 帧 Ack 里 16 帧写的是某个标签，24 帧写的是路由器自己；两个标签各作答 10 次，各有 8 次被确认、2 次丢失，丢失的两轮都是两个标签选中了同一个时隙。两个标签到达路由器的电平相差 6.7 dB，低于 10 dB 的门限，所以两路都解不出。',
      meaning: '标签只能从下一帧 Ack 得知结果（①）；同时到达的两路怎样判决，是本仿真器的取法（②）。',
    },
    {
      heading: '这一轮放不进一次 AC_BK 传输机会',
      more: [0],
      steps: [
        '依次载入本课场景与「上下行都用 1 Mb/s」，各看第一轮从 CTS-to-self 开始到最后一帧 Ack 结束有多长。',
        '与 AC_BK 缺省的 TXOP 限制比较。',
      ],
      blocks: [
        { kind: 'table', heading: '一轮的长度与 AC_BK 的 TXOP 限制', head: ['速率', '一轮', 'AC_BK 的 TXOP 限制'], rows: [
          ['250 kb/s', '4190 µs', '2528 µs'],
          ['1 Mb/s', '1670 µs', '2528 µs'],
        ] },
      ],
      expect: '250 kb/s 的一轮比 TXOP 限制长 1662 µs，引擎照样把它发完；1 Mb/s 的一轮在限制之内。',
      meaning: '§10.23.2.9 要求 TXOP 持有者不超过 TXOP 限制（①）；本仿真器让 AMP 轮不受这一限制，这是它与标准不同的地方（②）。',
    },
  ],
  sources: [
    'IEEE P802.11bp 草案（以 D0.5 为基线）：规范框架 11-24/1613r20 的 AM-2（动议 #29）、PM-2（#14）、PM-96（#212）、MM-7（#47、#226）、MM-45（#224）、MM-46（#227、#247）、FM-32（#187）、FM-48（#250）；草案文本 11-26/1519r5 的 39.3.2.1 与 39.3.2.2 节，11-26/1889r4 的 39.4 节；两份文本的通过记录见意向投票汇总 11-25/1692r50（#87、#90）。PAR 对 AC_BK 的规定引自共存评估文件 11-26/1582r3。',
    'IEEE Std 802.11-2024：§9.3.1.3（CTS-to-self）、§9.2.5.2（Duration 的设定）、§10.3.2.15（NAV 的分发）、§10.23.2.9 与表 9-194（TXOP 限制，AC_BK 缺省 2.528 ms）。',
    '本仿真器的取值与取法：每轮之前的 CTS-to-self、AMP 轮不受 TXOP 限制、最后一个时隙之后照样发 Ack、标签 −72 dBm 的下行灵敏度、下行 8 dB 与上行 10 dB 的信干噪比门限、5 dB 的改锁门限。',
  ],
  limits: [],
  scenario: () => ampIntroScenario({ dlKbps: 250, ulKbps: 250 }),
  variants: [
    {
      label: '上下行都用 1 Mb/s',
      scenario: () => ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 }),
    },
  ],
  jumps: [
    J('第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts')),
    J('第一帧 AMP Trigger', firstAmpTrigger),
    J('标签的第一次作答', firstAmpResp),
    J('第一帧确认标签的 AMP Ack', firstAmpAckToTag),
    J('第一次作答丢失（两个标签落在同一时隙）', firstAmpLost),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按草案，标签在什么时候可以发送？',
      options: [
        '侦听到信道空闲、退避计数减到零之后',
        '只在 AMP 接入点用触发帧征求之后，在分配给它的时隙里',
        '任何时候，只要它收集到足够的能量',
      ],
      answer: 1,
      explain: '39.4 节规定，除非 AMP 接入点征求，非 AP AMP STA 不得自行接入信道；规范框架的 PM-2 也说自行发射的终端只能在被轮询时发送。',
    },
    {
      q: '某个时隙（不是最后一个）里接入点什么也没收到。按 11-26/1519r5，随后那帧 AMP Ack 的 ID 字段写什么？',
      options: [
        '本该在这个时隙作答的那个标签',
        '接入点自己的标识',
        '不发 Ack，下一个时隙按时自动开始',
      ],
      answer: 1,
      explain: '这帧 Ack 还要标出下一个时隙的起点，所以必须发；没有可确认的标签时，草案文本让它写接入点自己的标识。',
    },
    {
      q: '哪一项是本仿真器自己的做法，而不是草案的规定？',
      options: [
        '标签在 [0, ACW] 里均匀随机取 ABOC',
        '第 1 个时隙在触发帧结束后一个 AMP SIFS 开始',
        '每一轮之前先发一帧 CTS-to-self',
      ],
      answer: 2,
      explain: '规范框架只对双基地反向散射要求先发保护帧；对自行发射的终端，CTS-to-self 是本仿真器的选择。',
    },
  ],
}
