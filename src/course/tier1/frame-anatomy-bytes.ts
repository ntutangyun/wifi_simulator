/**
 * Wi-Fi Tier 1 - M3 - lesson 3: what the radio puts in front of every frame,
 * and the arithmetic that turns a byte count into microseconds.
 *
 * The second half of the old `frame-anatomy`, and after the re-pacing of
 * 2026-09-25 the SOLE owner of that arithmetic: `airtime` keeps only the
 * answer's own rate and the pause and cites this lesson's six steps.
 *
 * The cost of a small frame and what one preamble buys a burst of fourteen are
 * `small-frames`, which loads this lesson's own scene — the same builder that
 * `frame-anatomy` loads, no variant — so the split adds no scenario.
 *
 * Standard-first shape (2026-11-10): ① IEEE Std 802.11-2024 clause 17 — the
 * non-HT PPDU (figure 17-1), what L-STF, L-LTF and L-SIG are for, TXTIME
 * (equation 17-29) in six steps — and what later PHYs keep in front (tables
 * 27-13, §27.4.3; U-SIG in 802.11be-2024 §36.3.12.7); ② where this simulator
 * follows it — the clause 17 arithmetic exactly, the HE symbol of table 27-13, and since
 * 2026-11-11 (W6) the HE preamble field by field, the LDPC symbol count and the packet
 * extension — and where it does not: the MU signalling is one symbol flat; ③ three runs.
 *
 * Every figure the lesson prints is read back out of its text and compared
 * with a run or with the engine's own function in
 * tests/course/frame-anatomy-bytes.test.ts.
 *
 * 2026-11-11 (W7a): the phone's HE frame is an S-MPDU now (§9.7.3, §10.12.7): its
 * symbols are counted from APEP_LENGTH = 4 + 230 = 234 octets (LDPC: 16 + 8 × 234 = 1888 bits,
 * one symbol) and the EOF padding fills it to the 241-octet PSDU_LENGTH of Eq 27-153 (§10.12.6).
 * One symbol, 43.2 µs preamble, 16 µs packet extension: 72.8 µs.
 */
import { PHY_MODES } from '../../engine/phy'
import type { TimingSpec } from '../diagram'
import { J, type Lesson } from '../lessonKit'
import { frameAnatomyScenario, firstLegacyData, firstQosSingle } from './frame-anatomy'

/** The two frames the figure draws, in microseconds: both are measured in the run. */
export const LEGACY_FRAME_US = 248
export const HE_FRAME_US = 72.8
/** The phone's frame's packet extension: a = 4 at 16 µs nominal packet padding (Table 27-47). */
export const HE_PE_US = 16

/**
 * The same two blocks the timeline shows, drawn to scale against each other:
 * the old laptop's 1528 B frame at 802.11a, and the phone's 230 B MPDU at
 * Wi-Fi 6. Every duration comes from `PHY_MODES` or from the run, and the test
 * reads each one back out of this spec, so the picture cannot drift.
 */
export function preambleTiming(): TimingSpec {
  const a = PHY_MODES.nonht
  const he = PHY_MODES.he
  const us = (ns: number): number => ns / 1000
  return {
    kind: 'timing',
    lanes: [
      { label: '802.11a', spans: [
        { label: '前导码', fromUs: 0, toUs: us(a.preambleNs) },
        { label: `57 个符号 × ${us(a.symNs)} µs`, fromUs: us(a.preambleNs), toUs: LEGACY_FRAME_US, tone: 'accent' },
      ] },
      { label: 'Wi-Fi 6', spans: [
        { label: '前导码', fromUs: 0, toUs: us(he.preambleNs) },
        { label: '1 个符号', fromUs: us(he.preambleNs), toUs: HE_FRAME_US - HE_PE_US, tone: 'accent' },
        { label: 'PE', fromUs: HE_FRAME_US - HE_PE_US, toUs: HE_FRAME_US },
      ] },
    ],
    axis: { fromUs: 0, toUs: LEGACY_FRAME_US, ticks: [0, 50, 100, 150, 200, 248], unit: 'µs' },
  }
}

export const frameAnatomyBytes: Lesson = {
  id: 'frame-anatomy-bytes',
  module: 2,
  title: '一帧在空口上占用多长时间',
  why: '前面两课逐一介绍了一帧的各个字段。这些字段都有代价：载荷（payload）前面每多一个字节，就多占用一段其他设备无法使用的空口时间（airtime）；而在帧本身之前，物理层（physical layer, PHY）还要发送一段前导码（preamble）。IEEE 802.11-2024 第 17 章规定，非 HT 的前导码由 10 个重复的短训练序列与 2 个长训练序列组成：前者供接收端调整增益、完成定时与粗略的频率同步，后者供接收端估计信道、完成精细的频率同步；随后一个以最稳健方式调制（modulation）的 SIGNAL 符号（symbol）给出后面部分的速率与长度。无法解码这一帧的设备，也能据此推算这一帧何时结束。后来的 HE 与 EHT 物理层仍以这三段开头，即 L-STF（legacy short training field）、L-LTF（legacy long training field）与 L-SIG（legacy signal field），再在其后加入自己的字段。空口时间不按字节计算，而按整数个符号计算：把八位组数换算成比特，加上 16 位服务字段（SERVICE field）与 6 个尾比特（tail bits），除以一个符号承载的数据比特数并向上取整，再加上前导码与 SIGNAL。所以服务质量（quality of service, QoS）控制字段多出的 2 个字节，常常正好落入最后一个符号的空余位置，不增加任何时间；而一个很小的确认帧（acknowledgement, ACK），空口时间大部分用在前导码上。本仿真器照第 17 章的公式计算非 HT 帧的时长；新一代物理层的前导码、符号数与包扩展（packet extension），也按各自一章的公式逐项计算。',
  outcomes: [
    '说出标准规定的非 HT 前导码与 SIGNAL 字段各有什么作用',
    '按标准的 TXTIME 公式，把一帧的字节数逐步换算成微秒，并说出向上取整发生在哪一步',
    '解释为什么帧头（MAC header）多两个字节，空口时间却可能完全不增加',
    '分清本仿真器的时长计算哪些照标准、哪些是它自己的取值',
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'L-STF', plain: '任何一帧最前面的一段：10 个重复的短训练序列，供接收端检测信号、调整增益、完成定时' },
    { term: 'L-LTF', plain: '紧随其后的一段：2 个长训练序列，供接收端在数据比特到来之前估计信道' },
    { term: 'L-SIG', plain: '历代 Wi-Fi 射频都能读懂的字段：指明这一帧其余部分的速率和长度' },
    { term: 'preamble', plain: '前导码：每一帧前面那段固定的已知信号，非 HT 帧中是 L-STF 与 L-LTF；新一代物理层在 L-SIG 之后还有自己的训练与信令字段' },
    { term: 'U-SIG', plain: 'Wi-Fi 7（EHT）在传统字段之后增加的一个字段，说明后面采用的是哪种新格式' },
  ],
  standard: [
    { heading: '非 HT 帧的格式（§17.3.2.1，§17.3.2.2，图 17-1，表 17-5）', text: '非 HT 的 PPDU（PHY protocol data unit）以前导码开头。前导码由 10 个重复的短训练序列（共 8 µs，用于自动增益控制、分集选择、定时与粗略的频率同步）和 2 个长训练序列（共 8 µs，用于信道估计与精细的频率同步）组成，T_PREAMBLE = 16 µs。其后是 SIGNAL：一个 4 µs 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）符号，以 BPSK（binary phase-shift keying）调制、编码率（coding rate）1/2 发送，携带 4 位 RATE、12 位 LENGTH、奇偶校验位与 6 个尾比特。再往后是 DATA：16 位的服务字段（SERVICE field）、PSDU（PHY service data unit）、6 个尾比特（tail bits），以及补满整数个符号的填充（padding）比特；20 MHz 信道间隔下每个数据符号 T_SYM = 4 µs。' },
    { heading: '无法解码的设备也能推算时长（§17.3.2.1）', text: '即使接收端不支持这一帧的数据速率，空闲信道评估（clear channel assessment, CCA）也能根据 SIGNAL 中的 RATE 与 LENGTH 推算这个 PPDU 的时长。后来的物理层都保留这三段：HE PPDU 以 8 µs 的 L-STF、8 µs 的 L-LTF 与 4 µs 的 L-SIG 开头（表 27-13）；EHT PPDU 在它们之后加入 U-SIG（universal signal field）（IEEE Std 802.11be-2024 §36.3.12.7）。' },
    { kind: 'formula', heading: '非 HT 帧的 TXTIME（§17.4.3，式 17-29）', text: 'TXTIME = T_PREAMBLE + T_SIGNAL + T_SYM × N_SYM\nN_SYM = ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉', note: '20 MHz 信道间隔：T_PREAMBLE 16 µs，T_SIGNAL 4 µs，T_SYM 4 µs（表 17-5）。N_DBPS 是一个符号承载的数据比特数，由速率决定：54 Mb/s 为 216，24 Mb/s 为 96（表 17-4）。LENGTH 是 PSDU 的八位组数。' },
    { kind: 'steps', heading: '从字节到微秒，按 §17.4.3：逐步说明', items: [
      '求 LENGTH：一个 MPDU（MAC protocol data unit）的八位组数是帧头、帧体（Frame Body）与 4 个八位组的帧校验序列（frame check sequence, FCS）之和（图 9-2）。',
      '换算成要发送的比特：16 位服务字段，加上 8 × LENGTH，再加 6 个尾比特（§17.3.2.2）。',
      '除以 N_DBPS 并向上取整，得到符号数 N_SYM；最后一个符号不满时用填充比特补满（§17.3.5.4）。',
      '加上前导码与 SIGNAL：TXTIME = 16 + 4 + N_SYM × 4 µs（式 17-29）。',
      '新一代物理层沿用同样的结构，但前导码更长、符号时长不同：HE 的数据符号在基本保护间隔下是 13.6 µs，在 1.6 µs 与 3.2 µs 的保护间隔下是 14.4 µs 与 16 µs（表 27-13）；HE 的 TXTIME 还包括 HE-LTF 与包扩展等项（§27.4.3）。HE 的 PSDU 总是聚合 MPDU（aggregate MPDU, A-MPDU），只有一个 MPDU 时前面也有一个 4 个八位组的定界符（MPDU delimiter）（§9.7.3，§10.12.7）；符号数按加 EOF 填充之前的长度 APEP_LENGTH 计算，物理层按式 27-153 给出数据符号能容纳的 PSDU_LENGTH，媒体访问控制（medium access control, MAC）层用 EOF 填充补到这个长度（§10.12.6）。',
      '帧头多出的八位组，只有使 16 + 8 × LENGTH + 6 越过 N_DBPS 的整数倍时，才会多出一个符号。',
    ] },
  ],
  implementation: [
    { topic: '非 HT 帧的时长', standard: '式 17-29 与表 17-5', sim: '照此计算：16 µs 前导码加 4 µs SIGNAL，即 20 µs，再加 N_SYM × 4 µs。', kind: 'faithful' },
    { topic: 'N_DBPS', standard: '表 17-4', sim: '照表取值：54 Mb/s 为 216，24 Mb/s 为 96。', kind: 'faithful' },
    { topic: 'HE 的数据符号', standard: '基本保护间隔下 T_SYM1 = 13.6 µs（表 27-13）', sim: '照此取 13.6 µs；保护间隔取哪一档由场景编写者选定，本课用基本档。', kind: 'faithful' },
    { topic: '新一代的前导码', standard: '随 HE-LTF 数、空间流（spatial stream）数与用户数变化（表 27-13，§27.4.3）', sim: '逐个字段相加：一个空间流时 VHT 40 µs、HE 43.2 µs、EHT 51.2 µs；LTF 的个数随空间流数增加（表 21-13、表 36-43）。EHT-SIG 用哪一级调制由发送端选择，本仿真器取最稳健的一级，占 2 个符号。', kind: 'faithful' },
    { topic: '多用户（multi-user, MU）帧的信令', standard: 'HE-SIG-B / EHT-SIG 的符号数由资源单元（resource unit, RU）分配与用户字段的个数决定（§27.3.11.8，IEEE Std 802.11be-2024 §36.3.12.8）', sim: '多用户帧一律另加 4 µs，即一个符号，不随用户数计算。', kind: 'differs' },
    { topic: 'HE 的符号数', standard: 'BCC 与 LDPC 编码各有公式，含编码前的填充（式 27-64、§27.3.12.5.2）；第 10、11 级只能用 LDPC（§27.3.12.5）', sim: '照此：BCC 按式 27-64 计数，含 6 个尾比特；第 10、11 级与宽于 242 个子载波（sub-carrier）的资源单元用 LDPC，没有尾比特，并判断是否加 LDPC 附加符号段。两种编码都允许时用 BCC，这是本仿真器的选择。LENGTH 照 ① 取 APEP_LENGTH：单个 MPDU 装成带 4 B 定界符的 A-MPDU，再用 EOF 填充补到式 27-153 的 PSDU_LENGTH。', kind: 'faithful' },
    { topic: '包扩展', standard: 'HE 的 TXTIME 包括包扩展 T_PE，按表 27-47 由预纠错填充因子 a 与接收方声明的名义填充（nominal packet padding）决定（§27.3.13）', sim: '本仿真器没有能力交换，规定每个接收方声明 16 µs 的名义填充，T_PE = 4a µs；手机那一帧 a = 4，包扩展 16 µs。', kind: 'value' },
    { topic: '载荷大小', standard: '由上层决定', sim: '旧笔记本的业务每份 1500 B，手机的语音业务每份 200 B。', kind: 'value' },
  ],
  labs: [
    {
      heading: '旧笔记本的一帧：248 µs',
      jump: 0,
      steps: [
        '载入本课场景，跳到旧笔记本的第一帧，把指针悬停在色块上读出时长。',
        '对照下表，按六步计算一遍。',
      ],
      blocks: [
        { kind: 'table', heading: '旧笔记本第一帧的计算', head: ['步骤', '数值'], rows: [
          ['LENGTH（八位组）', '24 + 1500 + 4 = 1528'],
          ['要发送的比特', '16 + 8 × 1528 + 6 = 12 246'],
          ['54 Mb/s 的 N_DBPS', '216'],
          ['N_SYM（向上取整）', '57'],
          ['TXTIME', '16 + 4 + 57 × 4 = 248 µs'],
        ] },
        {
          kind: 'diagram', heading: '两帧，按同一时间刻度绘制', spec: preambleTiming(),
          caption: '上面是旧笔记本 1528 B 的一帧：20 µs 的前导码与 SIGNAL，后面 57 个符号。下面是手机装着 230 B MPDU 的一帧：43.2 µs 的前导码，一个 13.6 µs 的符号，再加 16 µs 的包扩展。',
        },
      ],
      expect: '色块长 248 µs：前 20 µs 是前导码与 SIGNAL，其余是 57 个 4 µs 的符号。',
      meaning: '这正是式 17-29 的结果（①）；本仿真器照此计算非 HT 帧的时长（②）。',
    },
    {
      heading: '手机的一帧：大部分是前导码',
      jump: 1,
      steps: [
        '跳到第一个 QoS 数据帧（data frame），即手机发出的 Wi-Fi 6 帧，读出它的时长与前导码；它使用的调制与编码方式（modulation and coding scheme, MCS）是 HE MCS 11。',
        '用同样的步骤计算一遍：LENGTH 换成第五步的 APEP_LENGTH，即定界符加上这个 MPDU；HE MCS 11 只能用 LDPC 编码，LDPC 没有尾比特，最后再加上包扩展。',
      ],
      blocks: [
        { kind: 'table', heading: '手机第一帧的计算', head: ['步骤', '数值'], rows: [
          ['APEP_LENGTH（八位组）', '4 + 26 + 200 + 4 = 234'],
          ['要发送的比特', '16 + 8 × 234 = 1888'],
          ['HE MCS 11 的 N_DBPS', '1950'],
          ['N_SYM（向上取整）', '1'],
          ['包扩展', '16 µs'],
          ['时长', '43.2 + 1 × 13.6 + 16 = 72.8 µs'],
          ['EOF 填充之后的 PSDU（八位组）', '241'],
        ] },
      ],
      expect: '72.8 µs 中有 43.2 µs 是前导码、16 µs 是包扩展，载荷只占一个符号；这个符号余下的位置由 EOF 填充补满，PSDU 共 241 B。',
      meaning: '13.6 µs 的符号与 43.2 µs 的前导码照表 27-13（①、②）；符号数按 LDPC 的算法计算，16 µs 的包扩展来自表 27-47 与本仿真器规定的名义填充（②）。',
    },
    {
      heading: '帧头多 2 个字节，时长不变',
      steps: [
        '用式 17-29 把旧笔记本那一帧加上 QoS 控制字段后重算一遍。',
        '再跳到任意一个确认帧，读出它的时长。',
      ],
      blocks: [
        { kind: 'table', heading: '三帧的符号数', head: ['帧', 'LENGTH', '比特', 'N_DBPS', 'N_SYM', 'TXTIME'], rows: [
          ['旧笔记本的数据帧', '1528', '12 246', '216', '57', '248 µs'],
          ['同一帧加上 QoS 控制字段', '1530', '12 262', '216', '57', '248 µs'],
          ['确认帧（24 Mb/s）', '14', '134', '96', '2', '28 µs'],
        ] },
      ],
      expect: 'QoS 控制字段的 2 个字节没有多占一个符号，时长仍是 248 µs；确认帧的 28 µs 中有 20 µs 是前导码与 SIGNAL。',
      meaning: '空口时间按整数个符号计算（①，式 17-29）；小帧的开销集中在前导码上，这是下一课的主题。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§17.3.2.1、§17.3.2.2 与图 17-1（非 HT 的 PPDU 及其编码过程）、表 17-4（N_DBPS）、表 17-5（时间参数）、§17.3.5.4（填充比特）、§17.4.3 与式 17-29（TXTIME）、表 27-13（HE 的时间常数）、§27.4.3 与式 27-149（HE 的 TXTIME）、式 27-153（PSDU_LENGTH）、式 27-64 与 §27.3.12.5.2（符号数）、§27.3.13 与表 27-47（包扩展）、§9.7.3 与 §10.12.6、§10.12.7（HE 的 PSDU 总是 A-MPDU、APEP_LENGTH、EOF 填充与 S-MPDU）；IEEE Std 802.11be-2024 §36.3.12.7（U-SIG）。',
    '本仿真器的取值与取法：EHT-SIG 取最稳健的一级调制（2 个符号）、两种编码都允许时用 BCC、每个接收方声明 16 µs 的名义填充、多用户帧的信令一律按一个符号计；载荷大小由场景的业务决定。各帧的时长都是本课场景的实测值。',
  ],
  limits: [],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个传统数据帧', firstLegacyData),
    J('第一个 QoS 数据帧', firstQosSingle),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么 Wi-Fi 7 的帧开头仍是 L-STF、L-LTF 与 L-SIG？',
      options: [
        '因为新字段无法放在最前面',
        '这样附近任何一台射频，即使无法解码这一帧，也能从 L-SIG 推算它占用空口多久',
        '因为 L-SIG 里装着地址',
      ],
      answer: 1,
      explain: '§17.3.2.1：即使不支持这一帧的速率，CCA 也能根据 RATE 与 LENGTH 推算 PPDU 的时长。',
    },
    {
      q: '业务标记使帧头增加了两个字节，但这一帧的空口时间没有变化。为什么？',
      options: [
        '标记放在前导码中发送，而前导码长度固定',
        '空口时间按整数个符号计算，而最后那个符号本来就有空余位置',
        '校验会相应缩短两个字节，留出位置',
      ],
      answer: 1,
      explain: '1528 B 与 1530 B 都向上取整到 57 个符号，都是 248 µs。只有当那两个字节使帧延伸到下一个符号时，才会增加时间。',
    },
    {
      q: '把载荷从 1500 B 减到 1400 B，旧笔记本这一帧的空口时间会怎样？',
      options: [
        '按比例缩短：少 6.7 % 的字节，就少 6.7 % 的时间',
        '减少几个完整的符号——只有跨过符号边界才会改变时长',
        '完全不变：前导码是固定的',
      ],
      answer: 1,
      explain: '少 100 B 就是少 800 比特，54 Mb/s 下一个符号承载 216 比特，所以从 57 个符号减到 53 个，少 4 个符号、16 µs；前导码与 SIGNAL 的 20 µs 保持不变。',
    },
  ],
}
