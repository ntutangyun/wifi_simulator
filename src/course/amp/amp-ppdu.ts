/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · A frame a tag can hear.
 *
 * Standard-first since 2026-11-11 (the shape `@uwb-contention` set): ① what the TGbp
 * specification framework and the triggering PDT fix about the downlink and uplink AMP PPDUs and
 * the AMP frames they carry, motion by motion; ② what this simulator does about each — most of the
 * PHY timing is the draft's, the field widths the draft leaves open are the simulator's, and the
 * signal extension after a downlink AMP PPDU is its own reading; ③ three guided runs.
 *
 * It loads exactly the scene `amp-intro` loads — same builder, same variant — so the recorded
 * timeline hashes of `amp-ppdu` are `amp-intro`'s. Every figure quoted below is read back out of
 * this file and compared with a run in tests/course/amp-ppdu.test.ts.
 */
import { J, firstAmpAckToTag, firstAmpTrigger, txOf, type Lesson } from '../lessonKit'
import { ampIntroScenario } from './amp-intro'

export const ampPpdu: Lesson = {
  id: 'amp-ppdu',
  module: 10,
  title: '标签能够解调的帧',
  why: 'P802.11bp 的下行（downlink, DL）AMP PPDU（PHY protocol data unit）由两部分组成：前一部分是 Wi-Fi 7 的前导码（preamble），依次为 L-STF（legacy short training field）、L-LTF（legacy long training field）、L-SIG（legacy signal field）、RL-SIG 和 U-SIG（universal signal field），U-SIG 里的物理层（physical layer, PHY）版本为 0、PPDU 类型为 3，周围的 Wi-Fi 设备据此识别出这一帧并读出它的长度；后一部分用通断键控（on-off keying, OOK）和 Manchester 编码发给标签——AMP-Sync、两个字节的 AMP-SIG、数据，以及给标签留出处理时间的填充（padding）。上行（uplink, UL）AMP PPDU 没有 Wi-Fi 前导码，只有 AMP-Sync 和数据，所以 Wi-Fi 设备只能测到能量，解不出一帧。这些格式和时长大多已由 TGbp 规范框架的动议与已获通过的草案文本固定：下行 AMP-Sync 40 个 2 µs 的码片（chip），共 80 µs；上行 AMP-Sync 48 个码片；未加密的触发帧（Trigger frame）与 Ack 填充 20 µs，加密的触发帧填充 36 µs。本仿真器按这些规定计算每一帧的空口时间（airtime），帧头（MAC header）字段宽度和触发帧帧体（Frame Body）的编码是它自己的取值，下行 AMP PPDU 末尾另加 2.4 GHz 的 6 µs 信号扩展。于是 250 kb/s 下，只有四个字节的确认帧（acknowledgement, ACK）也长 330 µs，其中 202 µs 与内容无关；速率提高到四倍时，上行作答缩短到四分之一，触发帧只缩短到四成多。',
  outcomes: [
    '说出下行与上行 AMP PPDU 各由哪些字段组成，以及每个字段出自哪条动议',
    '分清哪些时长由草案固定、哪些宽度是本仿真器的取值',
    '解释为什么四个字节的 Ack 要几百微秒，以及速率提高时哪种帧缩短得最多',
  ],
  needs: ['amp-intro'],
  terms: [
    { term: 'OOK', plain: '通断键控：发射机只在开和关两种状态之间切换，以载波的有无表示码片' },
    { term: 'Manchester', plain: '曼彻斯特编码：比特 1 编为码片“01”，比特 0 编为“10”，每个比特中间都有一道边沿' },
    { term: 'preamble', plain: '前导码：一帧 Wi-Fi 的开头部分，所有 Wi-Fi 射频都能识别' },
    { term: 'AMP-Sync', plain: '标签部分开头的一段已知码片序列，用来检测这一帧并对准比特定时' },
    { term: 'AMP-SIG', plain: '下行帧里 AMP-Sync 之后的信令字段，给出接收设备类型、部分标识和数据长度' },
    { term: 'padding', plain: '填充：帧尾不携带内容的一段，为接收端留出准备作答的时间' },
  ],
  standard: [
    { heading: '依据（11-24/1613r20；11-26/1519r5）', text: 'P802.11bp 仍是草案。下面的格式来自规范框架 11-24/1613r20 已通过的动议，填充时长来自草案文本 11-26/1519r5 的 39.3.2.2 节；TGbp 在 2026 年 9 月会议上以意向投票 #87 无异议同意把这份文本并入下一版草案（11-25/1692r50）。' },
    { heading: '下行 PPDU 的 Wi-Fi 部分（规范框架 PM-15、PM-36、PM-54、PM-64）', text: '接入点（access point, AP）发给自行发射终端的下行 AMP PPDU 以 L-STF、L-LTF、L-SIG、RL-SIG 和 U-SIG 开头（动议 #28），在 20 MHz 信道上发送（#148）。L-SIG 的速率字段设为 6 Mb/s，长度字段取 3 的整数倍（#86）。U-SIG 的物理层版本设为 0、PPDU 类型与压缩模式设为 3，以此标明这是一帧下行 AMP PPDU（#131）。' },
    { heading: '下行 AMP-Sync（规范框架 PM-40、PM-41、PM-53、PM-71）', text: '发给非反向散射终端的下行 AMP-Sync 码片长 2 µs（#90）。它分两段：第一段 32 个码片，250 kb/s 用序列 W，1 Mb/s 用 W 的逐位取反，标签从中得知数据速率（#91、#130）；第二段是 8 个码片的“特殊段” [11111010]，两种速率相同，用来降低误检率（#162）。' },
    { heading: 'AMP-SIG（规范框架 PM-65、PM-95、PM-105、PM-78）', text: 'AMP-SIG 位于 AMP-Sync 之后、数据之前。发给自行发射终端时它有 2 个字节：1 位版本、1 位接收设备类型、6 位部分站点（station, STA）标识（为 0 表示广播）、6 位数据字段长度和 2 位循环冗余校验（cyclic redundancy check, CRC）（#149、#208、#251）。它与数据字段使用同一速率、同一码片长度和 Manchester 编码（#177）。' },
    { heading: '调制（modulation）、编码与速率（规范框架 PM-6、PM-7、PM-9、PM-23、PM-31）', text: '下行 AMP-Sync 与数据都用通断键控（#9），数据用 Manchester 编码（#10）：比特 1 编为码片“01”，比特 0 编为“10”（#41、#79）。下行速率为 250 kb/s 与 1 Mb/s，后者只用于非反向散射终端（#16）；对应的码片长 2 µs 与 0.5 µs（#77）。' },
    { heading: '填充（规范框架 PM-106、PM-107、FM-43；11-26/1519r5 §39.3.2.2）', text: '下行 AMP PPDU 可以在数据字段之后带一个填充字段，时长与下行速率无关，帧校验序列（frame check sequence, FCS）在填充之前（#252、#253、#238）。草案文本规定：载有未加密触发帧或标出时隙起点的 Ack 时，填充 20 µs；载有加密触发帧时，填充 36 µs。它的作用是让收到这一帧的终端能在一个短帧间间隔（short interframe space, SIFS）之内发出作答。规范框架的 FM-37、FM-38 原先给的是至少 40 µs 与 25 µs，并注明计算 TXTIME 时若含 aSignalExtension，填充应相应调整。' },
    { heading: '上行 PPDU（规范框架 PM-8、PM-35、PM-50、PM-51、PM-76、PM-77、PM-93）', text: '自行发射终端的上行 AMP PPDU 只有 AMP-Sync 与数据两个字段，带宽小于 20 MHz（#11），没有 Wi-Fi 前导码。AMP-Sync 长 48 个码片（#128），同一帧里 AMP-Sync 与数据的码片等长（#85）。250 kb/s 用 1 µs 码片加码率 1/2 的卷积码，1 Mb/s 用 0.25 µs 码片加同一卷积码，4 Mb/s 用 0.125 µs 码片、不编码且为可选（#127、#206、#176）。上行数据加扰（#175）。' },
    { heading: 'AMP 帧（规范框架 FM-13、FM-14、FM-16—FM-18、FM-20、FM-33、FM-49）', text: 'AMP 帧由媒体访问控制（medium access control, MAC）帧头、可选的帧体和帧校验序列组成（#116）。帧头含帧控制（Frame Control）、ID 和类型相关控制三个字段（#117）；帧控制 8 位（#119）；对自行发射终端，ID 为 12 或 16 位（#120），类型相关控制若存在为 8、12 或 16 位（#121）。未加密帧的 CRC 为 16 位（#123）。AMP Ack 是定长帧，含帧控制、接收方标识和帧校验序列（#188），其中 CRC 只取 8 位（#258）。' },
    { kind: 'steps', heading: '一帧下行 AMP PPDU，从左到右', items: [
      'L-STF、L-LTF、L-SIG、RL-SIG、U-SIG：Wi-Fi 7 的前导码，在 20 MHz 信道上发送（PM-15、PM-64）。',
      'AMP-Sync：32 个码片的 W 或其取反，再加 8 个码片的特殊段，码片长 2 µs（PM-40、PM-53、PM-71）。',
      'AMP-SIG：2 个字节，与数据同速率（PM-105、PM-78）。',
      '数据：AMP 帧，Manchester 编码的通断键控（PM-7、PM-23）。',
      '填充：未加密触发帧与 Ack 20 µs，加密触发帧 36 µs（§39.3.2.2）。',
    ] },
    { heading: '802.11 本身的两个时长（IEEE Std 802.11-2024 表 18-5）', text: '2.4 GHz 的 aSIFSTime 为 10 µs，aSignalExtension 为 6 µs：以正交频分复用（orthogonal frequency-division multiplexing, OFDM）方式发送的帧之后有一段 6 µs 的静默，称为信号扩展。' },
  ],
  implementation: [
    { topic: 'Wi-Fi 部分', standard: 'L-STF、L-LTF、L-SIG、RL-SIG、U-SIG（PM-15）', sim: '按 32 µs 计：L-STF 与 L-LTF 16 µs，L-SIG 4 µs，RL-SIG 与 U-SIG 12 µs。', kind: 'faithful' },
    { topic: '只允许 Wi-Fi 7 接入点轮询', standard: '下行 AMP PPDU 以 U-SIG 的物理层版本 0 标明（PM-54）', sim: '编辑器只允许 Wi-Fi 7（EHT）接入点发起 AMP 轮询，拒绝其他代际的接入点。', kind: 'choice' },
    { topic: '下行 AMP-Sync', standard: '32 + 8 个 2 µs 码片（PM-40、PM-53、PM-71）', sim: '两种速率都按 80 µs 计；码片序列本身不建模。', kind: 'faithful' },
    { topic: 'AMP-SIG', standard: '2 个字节，与数据同速率（PM-105、PM-78）', sim: '照此计时：250 kb/s 下 64 µs，1 Mb/s 下 16 µs；字段内容不建模。', kind: 'faithful' },
    { topic: '比特时长', standard: 'Manchester 编码的通断键控，码片 2 µs 或 0.5 µs（PM-23、PM-31）', sim: '下行每个比特 4 µs（250 kb/s）或 1 µs（1 Mb/s）。', kind: 'faithful' },
    { topic: '填充', standard: '未加密触发帧与 Ack 20 µs，加密触发帧 36 µs（§39.3.2.2）', sim: '照此取值；本课场景里每一帧都未加密，都填充 20 µs。', kind: 'faithful' },
    { topic: '信号扩展', standard: '草案文本没有说下行 AMP PPDU 之后是否有信号扩展；规范框架只在 FM-37、FM-38 的注里提到 TXTIME 可能含 aSignalExtension', sim: '每帧下行 AMP PPDU 之后都加 6 µs 的信号扩展。', kind: 'choice' },
    { topic: '帧头宽度', standard: '帧控制 8 位；ID 12 或 16 位；类型相关控制 8、12 或 16 位（FM-16—FM-18）', sim: '帧控制 1 字节、ID 2 字节、类型相关控制 2 字节、CRC 2 字节。', kind: 'value' },
    { topic: '触发帧帧体', standard: '§39.3.2.1 列出必须给出的参数；本课依据的文件没有给出编码', sim: '6 个字节：会话号 1、ACWE 与时隙数 1、时隙长度 2、上行速率与扰码与信道 1、作答内容 1。', kind: 'value' },
    { topic: 'AMP Ack', standard: '帧控制、接收方标识、8 位 CRC（FM-33、FM-49）', sim: '4 个字节：帧控制 1、ID 2、CRC 1。', kind: 'faithful' },
    { topic: '上行 PPDU', standard: 'AMP-Sync 48 个码片，与数据码片等长（PM-51、PM-35）', sim: 'AMP-Sync 250 kb/s 下 48 µs、1 Mb/s 下 12 µs；没有 Wi-Fi 前导码，也没有信号扩展。', kind: 'faithful' },
    { topic: '上行编码', standard: '卷积码与加扰（PM-50、PM-76）', sim: '比特时长按名义速率计算，不计卷积码可能带来的尾比特（tail bits）；扰码不建模。', kind: 'choice' },
    { topic: '读数', standard: '作答可以带帧体，内容待定（FM-29）', sim: '读数取 8 个字节：带读数的作答 15 个字节，只报身份的作答 7 个字节。', kind: 'value' },
  ],
  labs: [
    {
      heading: '打开一帧触发帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧 AMP 触发帧，在帧细节里打开它。',
        '把那条彩色条带从左向右读一遍，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '250 kb/s 触发帧的各段', head: ['段', '时长', '由谁解读'], rows: [
          ['L-STF 与 L-LTF', '16 µs', 'Wi-Fi 设备'],
          ['L-SIG（legacy signal field）', '4 µs', 'Wi-Fi 设备'],
          ['RL-SIG 与 U-SIG（universal signal field）', '12 µs', 'Wi-Fi 7 设备'],
          ['AMP-Sync', '80 µs', '标签'],
          ['AMP-SIG，2 个字节', '64 µs', '标签'],
          ['触发帧，13 个字节', '416 µs', '标签'],
          ['填充', '20 µs', '无'],
          ['信号扩展', '6 µs', '无'],
        ] },
      ],
      expect: '各段相加 32 + 80 + 64 + 416 + 20 + 6 = 618 µs；其中只有 AMP-SIG 与触发帧两段随速率变化，其余 138 µs 与速率无关。',
      meaning: '前四段与填充的时长照草案（①）；13 个字节里的字段宽度与末尾 6 µs 的信号扩展是本仿真器的取法（②）。',
    },
    {
      heading: '三种 AMP 帧，两种速率',
      more: [0],
      steps: [
        '依次载入本课场景与「上下行都用 1 Mb/s」，在帧细节里分别打开第一帧触发帧、第一帧 Ack 和第一次作答。',
        '对照下表读出每种帧的字节数与空口时间。',
      ],
      blocks: [
        { kind: 'table', heading: '三种 AMP 帧的空口时间', head: ['帧', '字节', '250 kb/s', '1 Mb/s'], rows: [
          ['AMP 触发帧（下行）', '13', '618 µs', '258 µs'],
          ['AMP Ack（下行）', '4', '330 µs', '186 µs'],
          ['带读数的作答（上行）', '15', '528 µs', '132 µs'],
        ] },
      ],
      expect: '作答缩短到四分之一（528 µs 变为 132 µs），因为它没有与速率无关的部分；触发帧只从 618 µs 缩短到 258 µs。1 Mb/s 下整轮长 1670 µs。',
      meaning: '上行 PPDU 只有 AMP-Sync 与数据，二者码片等长（①），所以作答随速率等比缩短；下行 PPDU 的 Wi-Fi 部分、AMP-Sync 和填充都不随速率变化（①）。',
    },
    {
      heading: '四个字节的 Ack',
      jump: 1,
      steps: [
        '跳到第一帧确认标签的 AMP Ack，在帧细节里打开它，读出 ID 字段。',
        '再打开一帧跟在空时隙之后的 Ack，比较两帧的长度与 ID。',
      ],
      blocks: [
        { kind: 'formula', heading: '一帧 Ack 的 330 µs', text: '250 kb/s 下的 4 个字节 = 128 µs + 202 µs 与内容无关的部分 = 330 µs', note: '与内容无关的部分：Wi-Fi 前导码 32 µs、AMP-Sync 80 µs、AMP-SIG 64 µs、填充 20 µs、信号扩展 6 µs。' },
      ],
      expect: '第一帧 Ack 在 1226 µs 发出，ID 字段 2 个字节，写的是 Door tag；空时隙之后那一帧同样 330 µs、同样 4 个字节，ID 写的是路由器自己。路由器那帧 14 个字节的 CTS-to-self（CTS to self）只用 50 µs。',
      meaning: 'Ack 的组成照规范框架（①）；ID 取 16 位是草案允许的两种宽度之一，由本仿真器选定（②）。',
    },
  ],
  sources: [
    'IEEE P802.11bp 草案：规范框架 11-24/1613r20 的 PM-6（动议 #9）、PM-7（#10）、PM-8（#11）、PM-9（#16）、PM-15（#28）、PM-23（#41、#79）、PM-31（#77）、PM-35（#85）、PM-36（#86）、PM-40（#90）、PM-41（#91）、PM-50（#127）、PM-51（#128）、PM-53（#130）、PM-54（#131）、PM-64（#148）、PM-65（#149）、PM-71（#162）、PM-76（#175）、PM-77（#176）、PM-78（#177）、PM-93（#206）、PM-95（#208）、PM-105（#251）、PM-106（#252）、PM-107（#253）、FM-13（#116）、FM-14（#117）、FM-16—FM-18（#119—#121）、FM-20（#123）、FM-29（#184、#231）、FM-33（#188）、FM-37、FM-38（#214、#215）、FM-43（#238）、FM-49（#258）；草案文本 11-26/1519r5 §39.3.2.2（填充 20 µs 与 36 µs）；通过记录见 11-25/1692r50（#87）。',
    'IEEE Std 802.11-2024 表 18-5：2.4 GHz 的 aSIFSTime 10 µs、aSignalExtension 6 µs。',
    '本仿真器的取值与取法：帧头各字段的宽度、6 个字节的触发帧帧体、8 个字节的读数、下行 AMP PPDU 之后的 6 µs 信号扩展、按名义速率计算的上行比特时长、只允许 Wi-Fi 7 接入点轮询。',
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
    J('第一帧 AMP Trigger', firstAmpTrigger),
    J('第一帧确认标签的 AMP Ack', firstAmpAckToTag),
    J('第一帧“空时隙”的 AMP Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: 'Wi-Fi 设备怎样认出一帧下行 AMP PPDU？',
      options: [
        '从 AMP-Sync 的码片序列',
        '从 U-SIG：物理层版本为 0、PPDU 类型与压缩模式为 3',
        '从帧尾的填充',
      ],
      answer: 1,
      explain: '规范框架 PM-54（动议 #131）用 U-SIG 的这两个值标明下行 AMP PPDU；AMP-Sync 是写给标签的，Wi-Fi 设备解不出。',
    },
    {
      q: '按 11-26/1519r5，未加密触发帧末尾的填充有多长？它的作用是什么？',
      options: [
        '20 µs，让终端能在一个 SIFS 之内发出作答',
        '36 µs，把帧补齐到 OFDM 符号（symbol）边界',
        '6 µs，就是 2.4 GHz 的信号扩展',
      ],
      answer: 0,
      explain: '39.3.2.2 节：未加密触发帧与 Ack 填充 20 µs，加密触发帧 36 µs，用于让接收的终端有时间准备作答。',
    },
    {
      q: '标签作答时，为什么附近的 Wi-Fi 终端只能测到能量、解不出一帧？',
      options: [
        '作答信号太弱',
        '上行 AMP PPDU 只有 AMP-Sync 与数据，没有 Wi-Fi 前导码',
        '路由器事先让终端忽略这一帧',
      ],
      answer: 1,
      explain: '规范框架 PM-8 规定上行 AMP PPDU 由 AMP-Sync 与数据组成；没有前导码，Wi-Fi 接收机没有可以锁定的部分。',
    },
  ],
}
