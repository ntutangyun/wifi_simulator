/**
 * UWB Tier 1 · M14 · Time of flight · What a ranging frame is made of.
 *
 * In the standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① what IEEE Std 802.15.4-2024 specifies for an HRP UWB ranging frame — where the RMARKER is,
 * the four STS packet configurations, BPRF mandatory parameter set 3 and the length of every
 * field; ② what this simulator does with each, faithful or not; ③ three guided runs that read
 * the Poll and the Response of `uwb-intro`'s own round.
 *
 * It loads exactly the scene `uwb-intro` loads — same builder, same variant — so the recorded
 * hashes of `uwb-frame` are `uwb-intro`'s.
 *
 * Every figure printed below is read back out of the lesson text and compared with a run in
 * tests/course/uwb-frame.test.ts.
 */
import type { FieldsSpec } from '../diagram'
import { J, firstUwbPoll, firstUwbResp, type Lesson } from '../lessonKit'
import {
  DATA_SYMBOL_CHIPS, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, SFD_SYMBOLS,
  STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS, chipsToNs, psduSymbols, uwbPollBytes,
} from '../../uwb/phy'
import { uwbIntroScenario } from './uwb-intro'

/** One segment of the poll, in microseconds — `chipsToNs` of the chip count the PHY gives it. */
const us = (chips: number): number => Math.round(chipsToNs(chips)) / 1000

/**
 * The poll from left to right, each box as wide as the field is long. The chip
 * counts are the PHY's own constants, so a figure cannot drift from the frame
 * the engine builds, and the third box is the 512-chip silence after the SFD
 * whose first chip is the RMARKER — which is why the stamp is drawn there.
 */
export function uwbFrameFields(): FieldsSpec {
  const psdu = us(psduSymbols(uwbPollBytes(1)) * DATA_SYMBOL_CHIPS)
  const sfd = us(SFD_SYMBOLS * PSYM_CHIPS)
  const gap = us(STS_GAP_CHIPS)
  const phr = us(PHR_SYMBOLS * PHR_SYMBOL_CHIPS)
  // A box too narrow to hold its own duration carries it in the label instead, so every
  // field in the figure states its length; the widest three print it under their name.
  const fields = [
    { label: 'SYNC', size: us(SYNC_SYMBOLS * PSYM_CHIPS) },
    { label: `SFD ${sfd.toFixed(3)} µs`, size: sfd },
    { label: '↓RMARKER', size: gap },
    { label: 'STS', size: us(STS_ACTIVE_CHIPS) },
    { label: `间隔 ${gap.toFixed(3)} µs`, size: gap },
    { label: `PHR ${phr.toFixed(3)} µs`, size: phr },
    { label: 'PSDU', size: psdu },
  ]
  const total = fields.reduce((n, f) => n + f.size, 0)
  return {
    kind: 'fields',
    fields,
    unit: 'µs',
    total: `整帧 ${total.toFixed(3)} µs：结构 ${(total - psdu).toFixed(3)}，消息 ${psdu.toFixed(3)}`,
  }
}

export const uwbFrame: Lesson = {
  id: 'uwb-frame',
  module: 14,
  title: '一帧测距帧由什么组成',
  why: '一帧测距帧几乎不携带数据，却很长——比一个 Wi-Fi 的确认帧（ACK）长得多，因为其中大部分是帧结构，而不是消息内容。IEEE 802.15.4-2024 规定了这些结构：开头是由前导符号（preamble symbol）重复构成的同步字段（SYNC field, SYNC），接着是标示同步结束的帧起始定界符（start-of-frame delimiter, SFD）；这一边界之后的第一个码片（chip）就是时间戳参考点 RMARKER（ranging marker），它在帧内的位置不随后面的内容改变。标准定义了四种分组配置，规定加扰时间戳序列（scrambled timestamp sequence, STS）放在帧的什么位置；本课用的配置把它放在 SFD 与物理头（PHY header, PHR）之间，物理头说明消息的长度和速率，最后才是物理层（physical layer, PHY）载荷（payload），也就是几十个字节的消息本身。各字段的长度都由标准的参数集（parameter set）决定，本课把它们逐一相加，得出整帧的空口时间（airtime）；帧里带哪些信息单元、因而消息有多长，是本仿真器的取法。在本课的时隙安排里，两帧各占一个测距时隙（ranging slot），一轮测距中真正有帧在传输的只是一小部分时间。',
  outcomes: [
    '说出标准规定的一帧测距帧的五个组成部分，以及四种分组配置的区别',
    '在这一帧自己的时间轴上指出 RMARKER 的位置，并说明它为什么不随消息改变',
    '分清哪些长度出自标准的参数表，哪些是本仿真器的取法',
  ],
  needs: ['uwb-intro'],
  terms: [
    { term: 'SYNC', plain: '同步字段：由同一个前导符号重复构成，供接收端捕获（acquisition）这一帧并取得定时' },
    { term: 'SFD', plain: '帧起始定界符：一小段图案，标示同步字段的结束' },
    { term: 'STS', plain: '加扰时间戳序列：由上层设定的种子经 AES-128 生成的一段伪随机脉冲序列' },
    { term: 'PHR', plain: '物理头：说明后续消息的长度和数据速率' },
    { term: 'PSDU', plain: '物理层服务数据单元：物理层承载的消息本身' },
    { term: 'chip', plain: '一个脉冲位置的时长，499.2 MHz 下约 2.003 ns，是安排脉冲的最小时间单位' },
  ],
  standard: [
    { heading: 'RMARKER 在帧里的位置（§10.29.1.1，图 16-3）', text: 'RMARKER 定义为 SFD 之后第一个码片的脉冲峰值位于本机天线（antenna）的时刻，发送与接收的时间报告都以它为参考。增强测距设备可以用 STS 确定到达时间，再由此推算 RMARKER 的时刻。' },
    { kind: 'table', heading: '四种分组配置（§16.2.1，表 16-1）', head: ['配置', 'STS 的位置', '支持'], rows: [
      ['0', '不含 STS', '必选'],
      ['1', '紧接 SFD 之后、PHR 之前', '必选'],
      ['2', 'PHY 载荷之后', '可选'],
      ['3', '紧接 SFD 之后，没有 PHR 与数据', '必选'],
    ] },
    { heading: 'BPRF 的强制参数集（§16.7，表 16-31）', text: 'BPRF 模式有四组强制参数集。第 3 组对应配置 1：同步字段 64 个前导符号，SFD #2（长 8 个符号（symbol）），一个 STS 段，长 64 × 512 码片，PHR 与数据以 6.8 Mb/s 发送。设备必须支持 0 到 127 字节的所有载荷长度。' },
    { kind: 'table', heading: '配置 1、第 3 组参数集的各个字段', head: ['字段', '标准的规定', '出处'], rows: [
      ['SYNC', '64 个前导符号；长 127 的前导码（preamble）每个符号 508 码片', '表 16-31、表 16-5'],
      ['SFD', 'SFD #2：8 个符号，每个符号用前导符号扩展', '表 16-11'],
      ['STS', '64 × 512 码片的有效段，前后各一段 512 码片的静默间隔', '表 16-17、§16.2.9.1'],
      ['PHR', '19 个比特：数据速率、帧长、Ranging 位、前导码时长、SECDED 校验；连同 PHY 载荷的前两个比特，共 21 个符号以 PHR 速率发送，每个符号 512 码片', '图 16-7、表 16-2、表 16-4'],
      ['PHY 载荷', '每块数据加 48 个 RS 校验比特，最后加 2 个尾比特（tail bits）；以 6.8 Mb/s 发送，每个符号 64 码片', '§16.3.3.2、表 16-2、表 16-4'],
    ] },
    { heading: '测距时隙（§10.32.2、§10.29.1.5）', text: '测距块（ranging block）由整数个测距轮（ranging round）组成，每个测距轮再分成整数个测距时隙；一个测距时隙至少能容纳一帧测距帧。时隙长度以 RSTU（ranging scheduling time unit）计，由会话决定，标准没有给出取值。' },
    { kind: 'steps', heading: '一帧配置 1 的测距帧，按标准：逐步说明', items: [
      '发送端对 PHY 载荷做 RS 编码，生成 PHR，再做卷积编码（§16.2.2）。',
      '按配置 1 依次发送 SYNC、SFD、STS、PHR、PHY 载荷（表 16-1）。',
      'SFD 之后第一个码片离开天线的时刻，就是这一帧的 RMARKER；发送端向上层报告这一时刻的计数值（§10.29.1.1）。',
      '接收端报告同一个 RMARKER 到达的计数值；增强测距设备可以先用 STS 确定到达时间，再推算这一时刻（§10.29.1.1）。',
      '接收端按 PHR 里的数据速率与帧长解出 PHY 载荷（§16.2.7.1）。',
    ] },
  ],
  implementation: [
    { topic: '分组配置', standard: '四种配置（表 16-1）', sim: '本课的每一帧都用配置 1：STS 在 SFD 与 PHR 之间。', kind: 'faithful' },
    { topic: '参数集', standard: '四组强制参数集，另有可选组合（表 16-31）', sim: '固定用第 3 组：SYNC 64 个符号、SFD 8 个符号、STS 64 × 512 码片、数据 6.81 Mb/s；场景里不能改前导码长度与数据速率。', kind: 'value' },
    { topic: '各字段的长度', standard: '表 16-2、表 16-4、表 16-5、表 16-17', sim: '把各字段的码片数逐一相加得出空口时间：PHR 以 PHR 速率计 21 个符号，PSDU（PHY service data unit）其余比特以数据速率计。', kind: 'faithful' },
    { topic: '帧里带什么', standard: '标准不规定测距帧的固定长度；帧长由帧头（MAC header）与所带信息单元决定', sim: 'Poll 33 字节：帧头 9、ARC 5、RR 8、RDM 6、RRMC 3、帧校验序列（frame check sequence, FCS）2；应答帧 21 字节：帧头 9、RRMC 3、RRTI 7、FCS 2。帧头一律用 16 位短地址。', kind: 'choice' },
    { topic: 'RMARKER', standard: 'SFD 之后第一个码片（§10.29.1.1）', sim: '帧内 73.269 µs，即 SYNC 与 SFD 之和；应答帧也在同一偏移。', kind: 'faithful' },
    { topic: '到达时刻怎样估计', standard: '标准不规定；增强测距设备可以用 STS 确定到达时间（§10.29.1.1）', sim: '不用 STS：到达时刻按距离直接算出，再加随机误差。误差的参考按接收端对整个同步字段累加计算，取 18.1 dB 的增益。', kind: 'value' },
    { topic: '编码与脉冲', standard: 'RS 编码、卷积编码，再把比特映射为脉冲（§16.2.2、§16.3）', sim: '不生成脉冲，也不解码：各字段只计入长度，PHR 从不被解码，FCS 与 RS 校验比特只用于计算长度。', kind: 'absent' },
    { topic: '接收判决', standard: '标准不规定接收端的判决方法', sim: '到达电平不低于 −93 dBm 就收下整帧：没有比特错误，没有漏检同步字段的情形，也没有把噪声误认成 SFD 的情形。', kind: 'value' },
    { topic: '测距时隙', standard: '时隙长度由会话决定（§10.32.2）', sim: '2 ms，即 2400 RSTU；每一帧都从自己时隙的开头发出。', kind: 'value' },
  ],
  labs: [
    {
      heading: '从左到右读一帧 Poll',
      jump: 0,
      steps: [
        '载入本课场景，跳到 Poll 帧，在帧细节视图里打开它。',
        '从左到右读字段条带，每读到一段说出它的名称，并与下表对照。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一帧 Poll，按时长画', spec: uwbFrameFields(), caption: '每一格的宽度与时长成比例。时间戳打在第三格的第一个码片上，即 SFD 之后的第一个码片。' },
        { kind: 'table', heading: '202.500 µs 由什么组成', head: ['字段', '时长', '作用'], rows: [
          ['SYNC，64 个前导符号 × 508 码片 = 32 512 码片', '65.128 µs', '捕获并取得定时'],
          ['SFD，8 个前导符号 × 508 码片 = 4064 码片', '8.141 µs', '确定 RMARKER 的位置'],
          ['STS 间隔，512 码片', '1.026 µs', '静默'],
          ['STS，64 × 512 = 32 768 码片', '65.641 µs', '伪随机脉冲序列'],
          ['STS 间隔，512 码片', '1.026 µs', '静默'],
          ['PHR，21 个符号 × 512 码片 = 10 752 码片', '21.538 µs', '数据速率与帧长'],
          ['PSDU，33 个字节：312 个符号 × 64 码片 = 19 968 码片', '40.000 µs', 'Poll 帧的消息'],
          ['整帧 Poll', '202.500 µs', '结构 162.500 µs，消息 40.000 µs'],
        ] },
        { kind: 'formula', heading: '为什么 33 个字节需要 40.000 µs', text: '264 个数据比特 + 48 个校验比特 − 2 个比特（随物理头发送）+ 2 个符号的尾 = 312 个符号 × 64 码片', note: '按 6.81 Mb/s 计算，消息本身只需要 38.8 µs；多出的部分是编码。' },
      ],
      expect: '最后一段 PSDU 只有 40.000 µs，比开头 65.128 µs 的 SYNC 还短；整帧 202.500 µs，其中结构占 162.500 µs。',
      meaning: '除 PSDU 外，每一段的长度都出自第 3 组参数集（①）；PSDU 的 33 个字节由帧里带的信息单元决定，是本仿真器的取法（②）。',
    },
    {
      heading: 'RMARKER 在哪里',
      jump: 1,
      steps: [
        '跳到锚点（anchor）作答的时刻，打开应答帧，与 Poll 的字段条带对照。',
        '找出两帧各自的 RMARKER 偏移，以及两帧不同的那一段。',
      ],
      blocks: [
        { kind: 'formula', heading: 'RMARKER 的位置', text: 'SYNC 65.128 µs + SFD 8.141 µs = 帧内 73.269 µs' },
        { kind: 'table', heading: 'Poll 帧与应答帧', head: ['帧', '消息', '载荷', '整帧'], rows: [
          ['Poll', '33 octets', '40.000 µs', '202.500 µs'],
          ['Response', '21 octets', '27.692 µs', '190.192 µs'],
        ] },
      ],
      expect: '两帧只有 PSDU 不同，应答帧短 12.308 µs；两帧的 RMARKER 都在帧内 73.269 µs。',
      meaning: 'RMARKER 由 SFD 的结束确定（①），所以它的位置不随后面的 STS、PHR 与消息改变。',
    },
    {
      heading: '一轮里有多少时间在传帧',
      jump: 1,
      steps: [
        '看手机这条泳道的全貌：Poll 在第一个测距时隙，应答在第二个。',
        '读出应答帧发出的时刻，与两帧的长度对照。',
      ],
      expect: '应答帧在 2 000 000 ns 发出，即第二个时隙的开头；两个 2 ms 时隙里只有 393 µs 有帧在传输。',
      meaning: '时隙长 2 ms、每帧从时隙开头发出，都是本仿真器的取值（②）；标准只规定时隙至少容纳一帧（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1 与图 16-3（RMARKER）、§16.2.1 与表 16-1（四种分组配置）、§16.7 与表 16-31（BPRF 强制参数集）、表 16-5（前导符号 508 码片）、表 16-11（SFD #2）、表 16-17 与 §16.2.9.1（STS 段与间隔）、图 16-7 与表 16-2（PHR 与以 PHR 速率发送的 21 个符号）、表 16-4（每符号码片数）、§16.3.3.2（RS 编码）、§10.32.2（测距块、轮与时隙）。',
    '本仿真器的取值与取法：所有帧固定用第 3 组参数集；Poll 33 字节、应答帧 21 字节，由所带信息单元与 16 位短地址算出；2 ms 的测距时隙；18.1 dB 的同步累加增益；−93 dBm 的接收门限。',
  ],
  limits: [],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '相距 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('锚点作答', firstUwbResp),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '时间戳是在帧的什么位置读取的？',
      options: [
        '在 SYNC 的第一个码片',
        '在 RMARKER，即 SFD 之后的第一个码片——本课的帧里距帧首 73.269 µs',
        '在 PSDU 结束时，也就是确认帧正确之后',
      ],
      answer: 1,
      explain: '§10.29.1.1 把 RMARKER 定义为 SFD 之后的第一个码片；本课的帧里，它前面是 65.128 µs 的 SYNC 与 8.141 µs 的 SFD。',
    },
    {
      q: 'STS 在配置 1 的帧里放在哪里？',
      options: [
        'PHY 载荷之后',
        '紧接 SFD 之后、PHR 之前',
        '整帧没有 STS',
      ],
      answer: 1,
      explain: '表 16-1：配置 1 把 STS 放在 SFD 之后、PHR 之前；放在载荷之后的是配置 2，不含 STS 的是配置 0。',
    },
    {
      q: '为什么本课的 Poll 帧是 33 个字节？',
      options: [
        '标准把测距帧固定为 33 个字节',
        '它是本仿真器按帧头与所带信息单元算出的长度，标准不规定测距帧的固定长度',
        '因为 PHR 只能表示 33 个字节',
      ],
      answer: 1,
      explain: '33 字节是帧头 9、ARC 5、RR 8、RDM 6、RRMC 3、FCS 2 之和；第 3 组参数集要求支持 0 到 127 字节的任意载荷。',
    },
  ],
}
