/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · Rate anomaly — fairness gone wrong.
 *
 * Standard-first shape (2026-11-11): ① IEEE Std 802.11-2024's backoff draw (§10.3.3), the frozen
 * counter (§10.3.4.3), DIFS and EIFS (§10.3.2.3.5, §10.3.2.3.7, §10.3.7), the data rate the
 * standard leaves to the implementation (§10.6.5.8) and the receiver minimum sensitivity
 * (§17.3.10.2); ② what this simulator does — its own rate control, its hard-threshold receiver and
 * its capture rule; ③ four runs. The performance anomaly itself is a published result (Heusse et
 * al., INFOCOM 2003), cited as a paper and never as the standard.
 *
 * Every figure the labs print is read back out of this file by tests/course/anomaly.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash in tests/fixtures/lesson-hashes.json
 * stays byte-identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, longApartment, node, sc, firstData, J } from '../lessonKit'

/**
 * A 3.6 ms window of the run in which each station takes exactly three turns,
 * to scale. Every span is one TX_START and its own `txTimeNs` — the near
 * station's 248 µs three times, the far station's 704 µs three times — and
 * `anomaly.test.ts` reads each one back out of this spec.
 *
 * Three against three is the whole argument: the turns are equal and the blocks
 * are not, so what the far station takes is not turns but the clock they run on.
 */
export function anomalyTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '近端·快', spans: [
        { fromUs: 4322, toUs: 4570, label: '248 µs' },
        { fromUs: 5542, toUs: 5790 },
        { fromUs: 6735, toUs: 6983 },
      ] },
      { label: '远端·慢', spans: [
        { fromUs: 3491, toUs: 4195, label: '704 µs', tone: 'accent' },
        { fromUs: 4738, toUs: 5442, tone: 'accent' },
        { fromUs: 5913, toUs: 6617, tone: 'accent' },
      ] },
    ],
    axis: { fromUs: 3400, toUs: 7000, ticks: [3400, 4400, 5400, 6400], unit: 'µs' },
  }
}

export const anomaly: Lesson = {
  id: 'anomaly',
  module: 4,
  title: '速率异常——“公平”的反面',
  why: 'IEEE Std 802.11-2024 的信道接入规则只决定下一轮由谁发送：每台站点（station, STA）从同一个竞争窗口（contention window, CW）里均匀抽取退避（backoff）数，抽取的公式里没有帧长，也没有速率，所以始终有帧待发的站点竞争成功的轮次大致相当。一轮持续多久，取决于这一帧的长度与速率；而数据帧（data frame）用什么速率，标准只给出约束，不规定选择的方法。本仿真器的速率控制按信号强度查出上限，连续两次失败降一档。离接入点（access point, AP）较远、隔着一堵墙的站点只能用较慢的编码，同样 1528 字节的一帧要占用近三倍的空口时间（airtime），失败之后还会再降速；它占用介质（medium）的一轮期间，其余站点的计数全部冻结。所以按时间统计，结论与按轮次相反：200 ms 内两台站点竞争成功 209 轮与 154 轮，空口占比却是 25.9% 与 61.2%；快站点自己的链路（link）完全正常，送达的帧数只有它独占房间时的一半以下。这就是性能异常（performance anomaly），出自 Heusse 等人 2003 年的论文，不是标准的内容：它是“按轮次分配、不按时间分配”的必然结果。',
  outcomes: [
    '说出标准的信道接入规则保证什么、不规定什么',
    '分清本仿真器的速率控制与接收判决哪些是它自己的取法',
    '把一台站点的轮次与它的空口占比放在一起比较，并预测慢站点加入后快站点的吞吐量',
  ],
  needs: ['airtime', 'collisions-cw'],
  terms: [
    { term: 'airtime share', plain: '空口占比：整段时间中被某一台站点自身的发送所占用的比例' },
    { term: 'performance anomaly', plain: '一台站点只能以低速率发送，导致所有站点的吞吐量都下降' },
    { term: 'rate control', plain: '发送方选择数据帧速率的方法；本仿真器在帧连续失败之后改用更慢、更稳健的编码' },
  ],
  standard: [
    { heading: '退避数怎样抽取（§10.3.3）', text: '退避数是在 [0, CW] 上均匀分布的伪随机整数。CW 的初值是 aCWmin；每次发送失败使重传（retry）计数增加时，CW 取下一个值，即 2 的幂减 1，直到 aCWmax。20 MHz 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（physical layer, PHY）分别是 15 与 1023（表 17-24）。抽取的公式里只有 CW。' },
    { heading: '介质忙时计数冻结（§10.3.4.3）', text: '退避中的站点只在一个时隙（slot time）内介质始终空闲时才把计数减一；介质忙时不递减。所以一台站点发送的整段时间里，其余站点的计数都停在原值。' },
    { heading: '两种帧间间隔（§10.3.2.3.5，§10.3.2.3.7，§10.3.7）', text: '分布式帧间间隔（DCF interframe space, DIFS）= aSIFSTime + 2 × aSlotTime，即 16 + 2 × 9 = 34 µs。站点在一次接收出错之后、介质恢复空闲时，改用扩展帧间间隔（extended interframe space, EIFS）= aSIFSTime + AckTxTime + DIFS，AckTxTime 是以最低强制速率（mandatory rate）发送一个确认帧（acknowledgement, ACK）的时间；在此期间正确收到一帧，EIFS 即告结束。' },
    { heading: '数据帧用什么速率（§10.6.5.8）', text: '单播数据帧可以用接收方支持的任何速率发送，只受接收方通告的能力、信道宽度等约束。标准没有规定站点怎样在这些速率中选择，也没有规定发送失败之后是否改变速率。' },
    { heading: '最低灵敏度（sensitivity）与发送时间（§17.3.10.2，表 17-21，§17.4.3）', text: '接收机在表 17-21 给出的输入电平上，对 1000 个八位组的 PSDU（PHY service data unit），误包率必须不超过 10%；20 MHz 信道上 54 Mb/s 是 −65 dBm，18 Mb/s 是 −77 dBm，12 Mb/s 是 −79 dBm，9 Mb/s 是 −81 dBm。发送时间等于前导码（preamble）与 SIGNAL 字段的时长加上符号（symbol）时长乘以符号数；速率越低，同样的字节需要的符号越多。' },
    { kind: 'steps', heading: '两台站点竞争信道，按标准：逐步说明', items: [
      '两台站点都有帧待发；介质忙过之后，各自等介质连续空闲一个 DIFS（刚有一次接收出错的站点等 EIFS），再从 [0, CW] 中抽取退避数（§10.3.3）。',
      '每经过一个空闲时隙，计数减一；先减到 0 的站点发送（§10.3.4.3）。',
      '它用自己选定的速率发送；标准不规定这个速率怎样选择（§10.6.5.8）。这一帧在空中的整段时间里，另一台站点的计数冻结。',
      '接收方回复确认帧，双方重新开始下一轮竞争。',
    ] },
  ],
  implementation: [
    { topic: '退避与 CW', standard: '均匀抽取，CW 从 15 起按 2 的幂减 1 递增到 1023（§10.3.3，表 17-24）', sim: '照此；本课 200 ms 内 CW 取过 15、31、63。', kind: 'faithful' },
    { topic: 'DIFS 与 EIFS', standard: 'DIFS 34 µs；接收出错之后用 EIFS，等于短帧间间隔（short interframe space, SIFS）加最低强制速率的确认帧时间再加 DIFS（§10.3.2.3.7，§10.3.7）', sim: '照此：EIFS = 16 + 44 + 34 = 94 µs，44 µs 是 6 Mb/s 的确认帧；在此期间正确收到一帧就改回 DIFS。本课两台站点共 833 次等待中有 166 次是 EIFS，全部在远端站点。', kind: 'faithful' },
    { topic: '数据帧速率的选择', standard: '标准不规定（§10.6.5.8）', sim: '本仿真器的速率控制：按信号强度查表，信噪比（signal-to-noise ratio, SNR）比某一级所需的值高出 3 dB 以上的最高一级是上限，所需的值由表 17-21 的灵敏度换算；连续两次失败降一档，连续十次成功升一档，永不超过上限。没有随机性，不发送试探更高速率的帧，也不区分碰撞与信号过弱。', kind: 'choice' },
    { topic: '接收成败', standard: '在最低灵敏度上误包率不超过 10%（§17.3.10.2）', sim: '本仿真器用硬门限：整帧中最差的信干噪比（signal-to-interference-plus-noise ratio, SINR）达到该速率的要求就整帧成功，差 0.1 dB 就整帧失败。真实链路在门限附近是一条误包率曲线。', kind: 'differs' },
    { topic: '两帧同时开始', standard: '标准不规定接收机怎样处理相叠的帧', sim: '接收机锁定先检测到的前导码；两帧同时开始时，只有比另一路强出 4 dB 以上的前导码才被检测到。本课近端到达接入点比远端强约 40 dB，所以接入点只解出近端的帧，远端的帧没有被检测到，时间轴上也不记碰撞。', kind: 'choice' },
    { topic: '确认帧的速率', standard: '基本速率集中不高于前一帧速率的最高速率，没有时取强制速率（§10.6.6.5.2）', sim: '本仿真器没有基本速率集，一律取强制速率 6、12、24 Mb/s 中不高于数据帧速率的最高一档；确认帧 14 个字节。', kind: 'value' },
    { topic: '本课场景', standard: '标准不规定', sim: '两台站点都是 nonht，不聚合，也不使用传输机会（transmit opportunity, TXOP），每轮只发一帧；两台都是饱和业务，位置固定，默认没有衰落。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '同时开始的两帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个数据帧。',
        '读出两条泳道上这一帧的速率、长度与空口时间，再看接入点回复了哪一台。',
      ],
      expect: '两台站点都在 0 µs 开始发送 1528 字节的数据帧：近端 54 Mb/s，248 µs；远端 18 Mb/s，704 µs。接入点只解出近端的帧；远端在 749 µs 因 ACK 超时（ACK timeout）判定失败。200 ms 内时间轴上没有一次碰撞记录。',
      meaning: '字节数相同，空口时间相差近三倍，只因为速率不同（① §17.4.3）。远端的帧没有被检测到，是本仿真器的接收判决（② 两帧同时开始）。',
    },
    {
      heading: '一轮的时长',
      steps: [
        '载入本课场景，运行 200 ms。',
        '比较两条泳道上的绿色块：近端只有一种长度，远端有几种。',
      ],
      blocks: [
        { kind: 'table', heading: '一轮时长的由来', head: ['帧', '速率', '字节', '空口时间'], rows: [
          ['近端站点，每一帧', '54 Mb/s', '1528', '248 µs'],
          ['远端站点，最高的一档', '18 Mb/s', '1528', '704 µs'],
          ['远端站点，连降两档之后', '9 Mb/s', '1528', '1384 µs'],
        ] },
        {
          kind: 'diagram', heading: '同一段 3.6 ms 内两台站点各三轮',
          spec: anomalyTiming(),
          caption: '轮数相同，块长不同：近端每轮 248 µs，远端每轮 704 µs，双方承载的都是 1528 字节。',
        },
      ],
      expect: '近端的每一帧都是 54 Mb/s；远端的帧有 704、1044、1384 µs 三种长度，对应 18、12、9 Mb/s，是速率控制逐档下调的结果。',
      meaning: '远端的上限是 18 Mb/s，失败之后再降档，都是本仿真器的速率控制（②）；标准不规定这一点（① §10.6.5.8）。',
    },
    {
      heading: '按轮次与按时间',
      steps: [
        '载入本课场景，运行 200 ms。',
        '在检视器里读出两台站点竞争成功的轮次、被确认的轮次与各自的空口时间，按下表逐行计算。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的 200 ms：逐行计算', head: ['步骤', '近端·快', '远端·慢'], rows: [
          ['200 ms 内竞争成功的轮次', '209', '154'],
          ['每轮的空口时间', '248 µs', '795 µs'],
          ['= 占用的空口时间', '51.8 ms · 25.9 %', '122.4 ms · 61.2 %'],
          ['这些轮次中被确认的', '209', '135'],
          ['= 每秒送达的帧数', '1045', '675'],
          ['× 1528 字节 × 8 比特', '12.8 Mb/s', '8.3 Mb/s'],
        ] },
      ],
      expect: '两台站点的轮次相当，近端还多一些；远端的空口时间却是近端的两倍多。连同接入点的确认帧，介质在 200 ms 里有 92.2% 的时间被占用。远端 154 轮中只有 135 轮被确认。',
      meaning: '退避给出的是相当的轮次（① §10.3.3），每轮的时长由速率决定。计入吞吐量的是被确认的轮次；失败的轮次来自本仿真器的硬门限接收判决（② 接收成败）。',
    },
    {
      heading: '删除远端站点',
      steps: [
        '在编辑器里删除远端站点，重新载入，运行 200 ms，读出近端送达的帧数。',
        '恢复场景，再删除近端站点，读出远端独占房间时送达的帧数。',
      ],
      expect: '近端独占房间时送达 510 帧，与远端共处时只有 209 帧，不到一半；远端独占房间时送达 234 帧，比两台共处时任何一台都多。两台共处时合计 344 帧，也少于近端独占时。',
      meaning: '远端占去的不是轮次，而是那些轮次所需的空口时间。这就是 Heusse 等人在论文中描述的性能异常；它是标准接入规则（①）与本仿真器速率控制（②）共同作用的结果，标准本身没有这个概念。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.3 与表 17-24（退避数的抽取、aCWmin 与 aCWmax）、§10.3.4.3（介质忙时计数冻结）、§10.3.2.3.5、§10.3.2.3.7 与 §10.3.7（DIFS 与 EIFS）、§10.6.5.8（数据帧的速率）、§10.6.6.5.2（确认帧的速率）、§17.3.10.2 与表 17-21（最低灵敏度）、§17.4.3（发送时间）。',
    '性能异常出自论文，不是标准：M. Heusse、F. Rousseau、G. Berger-Sabbatel、A. Duda，《Performance anomaly of 802.11b》，IEEE INFOCOM 2003。',
    '本仿真器的取值与取法：速率控制（src/engine/rate.ts）、硬门限接收判决、4 dB 的前导检测余量、墙体损耗与饱和业务。上面每一个计数都来自本课场景的运行，可由随机种子复现。',
  ],
  limits: [],
  scenario: () => sc(longApartment(), [
    node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle'),
    node('sta-1', 'Near & fast', 'sta', 4.8, 4.3, 'nonht', 'saturated'),
    node('sta-2', 'Far & slow', 'sta', 15, 7, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一个数据帧', firstData),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '信道接入规则给每台“总有帧要发”的站点大致相等的是……',
      options: [
        '空口时间',
        '吞吐量',
        '轮次数量',
      ],
      answer: 2,
      explain: '每台站点都从同一个 CW 中均匀抽取（§10.3.3），竞争成功的频率大致相当；一轮占用多少时间则取决于各自的速率。',
    },
    {
      q: '远端站点加入后，近端的吞吐量为什么会下降？',
      options: [
        '它自己的信号变弱了',
        '分配给它的轮次比远端少',
        '远端的每一轮都占用空口很长时间，于是每秒能容纳的轮次总数减少了',
      ],
      answer: 2,
      explain: '它的链路完全正常，轮次甚至还多一些。它损失的是那些长轮次所占用的时间。',
    },
    {
      q: '哪一项是本仿真器自己的取法，而不是标准的规定？',
      options: [
        '退避数在 [0, CW] 上均匀抽取',
        '连续两次失败降一档速率',
        '接收出错之后用 EIFS',
      ],
      answer: 1,
      explain: '标准不规定站点怎样选择数据帧的速率（§10.6.5.8）；连续两次失败降一档是本仿真器的速率控制。另外两项都是标准的规定。',
    },
  ],
}
