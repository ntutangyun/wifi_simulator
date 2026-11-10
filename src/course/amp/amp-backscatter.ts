/**
 * Tier 2 · M10 · Ambient power IoT (802.11bp) · The backscatter tier.
 *
 * Standard-first since 2026-11-11 (the shape `@uwb-contention` set): ① what the TGbp
 * specification framework and the adopted PDTs fix about mono-static backscatter — the excitation
 * fields and their timing, the PPDUs, the UHF RFID commands carried in AMP frames, a single uplink
 * slot per trigger and no downlink Ack; ② what this simulator does about each, most visibly that
 * its inventory is an EPC Gen2 slot-counter round tunnelled in AMP RFID frames, after a proposal
 * the framework did not adopt, where the PDT gives an AMP trigger with one slot and ACWE random
 * access; ③ four guided runs.
 *
 * One mono-static reader on a table, six tags at 15, 28 and 40 cm. Scene, variants and jumps are
 * unchanged, so the recorded timeline hashes did not move. Every figure quoted below is read back
 * out of this file and compared with a run in tests/course/amp-backscatter.test.ts.
 */
import type { AmpBackscatterCfg, Scenario } from '../../model/scenario'
import {
  J, bsReader, bsTag, firstBsBoot, firstBsCollidedSlot, firstBsEpc, firstBsPartialRound,
  firstBsQuery, oneRoom, sc, type Lesson,
} from '../lessonKit'

/**
 * The lab: one mono-static reader on a table, six tags around it at three distances — four at
 * 15 cm, one at 28 cm, one at 40 cm. The reader sits at the tags' own height, because the whole
 * link is shorter than the distance to the ceiling.
 *
 * The three distances come off the engine's own two closed forms rather than off taste:
 * `activationReachM(10)` is 0.309 m and `monoReachM(0, 250)` is 0.328 m, so 15 cm is well
 * inside both, 28 cm is inside both with 5.7 dB of margin, and 40 cm is outside both.
 */
export function ampBackscatterScenario(bs: Partial<AmpBackscatterCfg> = {}): Scenario {
  return sc(oneRoom(), [
    bsReader('ap', 'Reader', 5, 4, 1, bs),
    bsTag('tag-1', 'Tag 1', 5.15, 4),
    bsTag('tag-2', 'Tag 2', 5, 4.15),
    bsTag('tag-3', 'Tag 3', 4.85, 4),
    bsTag('tag-4', 'Tag 4', 5, 3.85),
    bsTag('tag-5', 'Tag 5', 5.28, 4),
    bsTag('tag-6', 'Tag 6', 5, 4.4),
  ])
}

export const ampBackscatter: Lesson = {
  id: 'amp-backscatter',
  module: 10,
  title: '反向散射：标签以反射应答',
  why: 'P802.11bp 的第二类标签没有发射机：它把接入点（access point, AP）发来的载波反射回去，在反射与不反射之间切换天线（antenna）来形成比特。在单站模式下，接入点在命令之前发一段至少 1 ms 的 WUP-Excitation 为标签供电，在命令之后发一段 BST-Excitation 供标签反射；标签在命令结束后 16 µs（±20 %）应答，接入点不回确认帧（acknowledgement, ACK）。草案让这类标签使用 UHF RFID 标准的一部分命令（Select、Read、Write、Authenticate），由 AMP 帧携带；征求应答的触发帧（Trigger frame）只分配一个上行（uplink, UL）时隙，随机接入时带 ACWE。本仿真器的清点过程与草案不同：它按一份未被采纳的提案，在 AMP 帧里传送 EPC Gen2 的 Query、QueryRep 与 ACK，一轮开启 2^Q 个槽。能否读到取决于两个互不相关的距离：标签收到的功率能否唤醒它，反射回来的信号能否被解出。读写器的接收本底来自自身泄漏的载波，提高激励功率时回波与本底一同升高，所以唤醒距离增大到三倍多，可读取距离不变。这些功率计算所用的数值全部取自小组讨论过、规范框架没有采纳的文稿。',
  outcomes: [
    '说出草案对单站反向散射规定了什么：激励字段、应答时间、命令集、单个时隙、不回确认',
    '分清本仿真器的清点过程哪里照草案、哪里来自未被采纳的提案',
    '用反射回程的功率预算解释为什么提高激励功率不能延长可读取距离',
    '一张标签读不到时，判断先怀疑它是否上电，还是先怀疑回程信号',
  ],
  needs: ['amp-slots'],
  terms: [
    { term: 'backscatter', plain: '反向散射：标签自己不产生载波，只把接入点的载波反射回去，用反射的开与关表示比特' },
    { term: 'mono-static', plain: '单站：发送激励和接收反射的是同一台设备的两根天线，因此它在发送的同时也收到自己的信号' },
    { term: 'WUP-Excitation', plain: '命令之前的那段激励，为标签供电，草案要求至少 1 ms' },
    { term: 'BST-Excitation', plain: '命令之后的那段激励：标签依靠它维持供电，也依靠它反射应答' },
    { term: 'EPC', plain: '电子产品代码：标签的全局标识，草案把它作为反向散射标签的全局标识' },
    { term: 'Q', plain: 'EPC Gen2 清点里读写器在 Query 中宣布的数，一轮开启 2^Q 个槽；本仿真器沿用它' },
  ],
  standard: [
    { heading: '依据（11-24/1613r20；11-26/1519r5；11-26/1798r1）', text: 'P802.11bp 仍是草案。下面的规则来自规范框架 11-24/1613r20 已通过的动议，以及两份草案文本：11-26/1519r5 的 39.3.3 节（单站反向散射的触发过程）与 11-26/1798r1（单站反向散射的帧交换序列）。TGbp 在 2026 年 9 月会议上以意向投票 #87 与 #98 无异议同意把这两份文本并入下一版草案（11-25/1692r50）。' },
    { heading: '单站反向散射（规范框架 PM-3、AM-2、PM-28）', text: '草案为 2.4 GHz 定义至少一种近距离单站反向散射的模式（动议 #15）。反向散射的非 AP AMP 站点（station, STA）只能接收下行（downlink, DL）AMP PPDU（PHY protocol data unit），以反向散射方式发送上行（#29）。时钟误差以百万分之几（parts per million, ppm）计，在接收与反射时上限都是 100 000 ppm，即 10 %（#72）。' },
    { heading: '激励字段与应答时间（规范框架 PM-72—PM-75、PM-86—PM-88；动议 #167—#170、#199—#201）', text: '单站模式的下行 PPDU 里，AMP-Sync 之前的激励称为 WUP-Excitation，数据之后的激励称为 BST-Excitation（#167）。WUP-Excitation 至少 1 ms（#168）；2.4 GHz 下 BST-Excitation 至少 16 µs（#169）。即时应答的时间为 16 µs，误差 ±20 %（#170）。对即时应答的命令，BST-Excitation 至少为 T1 × 1.2 + T4 × 1.1，T1 = 16 µs，T4 为上行 PPDU 的名义长度（#200）。延迟应答时，标签在 [T3 × 0.9 − 1 µs，T3 × 1.1 + 1 µs] 内开始应答，BST-Excitation 至少为 T3 × 1.1 + 1 µs + T4 × 1.1（#199、#201）。' },
    { heading: 'PPDU（规范框架 PM-9、PM-10、PM-63、PM-65、PM-17、PM-22、PM-57）', text: '发给反向散射终端的下行速率只有 250 kb/s（#16）。2.4 GHz 下单站反向散射的下行 AMP-Sync 为 [0 1 1 1 1 0 1 0]，码片（chip）长 2 µs（#140、#18）；发给单站反向散射终端的下行 PPDU 没有 AMP-SIG（#149）。上行速率为 250 kb/s 与 1 Mb/s（#31），码片分别长 2 µs 与 0.5 µs（#40）；上行 AMP-Sync 的结构为 [S, S, S]，S = [1 1 0 1 0 1 0 0]（#134）。' },
    { heading: '命令与标识（规范框架 MM-10、MM-29、FM-44、FM-45、FM-25；11-26/1798r1）', text: '反向散射使用 UHF RFID 标准逻辑接口的一个子集，命令由 802.11bp 帧携带（#52）；必须支持 Select、Read、Write、Authenticate 四条命令，其他命令待定（#111、#112）。AMP RFID 帧携带这些命令，命令本身由 ISO/IEC 18000-63 定义（#239）。接入点可以先发一帧带有标签全部或部分 EPC 的单播帧（即 Select），再发其他帧（#241）。标签的 16 位标识由其全局标识的 CRC16 得出（#145）。11-26/1798r1 规定：命令需要处理时延时，接入点在同一传输机会（transmit opportunity, TXOP）里等待这段时延再接收应答，剩余的传输机会必须够用。' },
    { heading: '征求与确认（11-26/1519r5 §39.3.3；规范框架 FM-9、FM-35）', text: '发给单站反向散射终端的触发帧必须给出上行速率与时隙长度，而且只分配一个上行时隙；用于随机接入的触发帧还要带会话号与 ACWE。广播触发帧的 ID 字段为广播标识。接入点可以先用随机接入的广播触发帧征求标签的标识，再用单播触发帧向某个标签征求应答。接入点收到单站反向散射终端的应答之后，不发下行 Ack（#210）。' },
    { kind: 'steps', heading: '一次单站反向散射的交换，按草案：逐步说明', items: [
      '接入点取得传输机会，发出下行 PPDU：WUP-Excitation（至少 1 ms）、AMP-Sync、数据、BST-Excitation（#167—#169）。',
      '随机接入时，触发帧只分配一个上行时隙，带会话号与 ACWE（§39.3.3）。',
      '标签在命令结束后 16 µs（±20 %）开始反射，应答落在 BST-Excitation 之内（#170、#200）。',
      '接入点不回 Ack（#210）；需要读写时，用 AMP RFID 帧携带 Select、Read、Write 等命令（#239、#241）。',
      '命令需要处理时延时，接入点在同一传输机会里等待，BST-Excitation 按延迟应答的公式加长（#199、#201；11-26/1798r1）。',
    ] },
  ],
  implementation: [
    { topic: '清点过程', standard: '触发帧只分配一个时隙，随机接入带 ACWE（§39.3.3）；AMP RFID 帧携带 Select、Read、Write、Authenticate（#111、#112、#239）', sim: '按提案 11-25/0061r0 在 AMP RFID 帧里传送 EPC Gen2 的 Query、QueryRep 与 ACK：Query 宣布 Q，标签在 0 到 2^Q − 1 之间抽计数，抽到 0 的标签反射 16 位随机数 RN16，接入点用 ACK 回送 RN16，标签再反射 EPC；之后一帧 Read 读 8 个字节。草案没有采纳 Query、QueryRep 与 ACK 这三条命令。', kind: 'differs' },
    { topic: '一轮跨传输机会', standard: '草案没有规定', sim: '一个传输机会开不下的槽留到下一个传输机会，标签保留自己的计数；这一做法来自同一份提案的“Extend”命令，未被采纳。', kind: 'choice' },
    { topic: '传输机会的长度', standard: '一次传输机会不得超过 TXOP 限制，AC_BK 缺省 2.528 ms（IEEE Std 802.11-2024 §10.23.2.9，表 9-194）', sim: '读写器每个传输机会用 4 ms，前面有一帧 CTS-to-self（CTS to self）预留整个 4 ms。', kind: 'differs' },
    { topic: 'WUP-Excitation', standard: '至少 1 ms（#168）', sim: '每个传输机会的第一帧带 1 ms 的 WUP-Excitation，其后的帧不带。', kind: 'faithful' },
    { topic: 'BST-Excitation', standard: '即时应答至少 T1 × 1.2 + T4 × 1.1；延迟应答至少 T3 × 1.1 + 1 µs + T4 × 1.1（#200、#201）', sim: '照此计算，T1 = 16 µs。', kind: 'faithful' },
    { topic: '命令间隔与写入时延', standard: '接入点的转向时间与 Write 的处理时延，规范框架没有给出数值', sim: '两帧命令之间 16 µs（取自 11-26/0120r0）；Write 的应答时延 2 ms（同一文稿）。', kind: 'value' },
    { topic: '不回 Ack', standard: '收到单站反向散射终端的应答后不发下行 Ack（#210）', sim: '照此实现：接入点只发命令帧，不发 AMP Ack。', kind: 'faithful' },
    { topic: '速率与同步', standard: '下行 250 kb/s；上行 250 kb/s 或 1 Mb/s，码片 2 µs 或 0.5 µs；上行 AMP-Sync 为 [S, S, S]（#16、#31、#40、#134）', sim: '照此计时：上行 AMP-Sync 24 个码片。', kind: 'faithful' },
    { topic: '功率与门限的取值', standard: '规范框架没有给出', sim: '反射损耗 6 dB（11-23/2038r1）、天线隔离 20 dB 与接收动态范围 50 dB（11-25/0058r1）、上电门限 −20 dBm（11-24/0537r0）、250 kb/s 应答需要 3 dB 信噪比（signal-to-noise ratio, SNR）；激励 10 dBm 与 0 dBm 取自 11-25/0307r0。这几份文稿都未被规范框架采纳。', kind: 'value' },
    { topic: '读不出与空槽', standard: '草案没有规定', sim: '读写器在 BST-Excitation 期间做能量检测（energy detection, ED），区分“有反射但读不出”与“没有反射”。', kind: 'choice' },
    { topic: '同一槽里的两路反射', standard: '草案不规定接收机的判决', sim: '较强的一路信噪比达到门限、且比另一路强得多时可以解出；两路电平相同时都读不出。', kind: 'value' },
    { topic: '传播与上电', standard: '标准不规定信道模型', sim: '按 Friis 自由空间公式计算，2.4 GHz 下第一米 40.2 dB，5 cm 以内按 5 cm 计；上电是一条硬门限，低于 −20 dBm 的标签不产生任何记录。', kind: 'choice' },
    { topic: 'EPC 与 16 位标识', standard: '16 位标识由全局标识的 CRC16 得出（#145）', sim: '96 位的 EPC 由节点名称生成。', kind: 'value' },
  ],
  labs: [
    {
      heading: '哪些标签被唤醒，哪些能被读到',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次上电：同一时刻有五张标签各记录一条上电记录。',
        '运行满一秒，对照下表读出每张标签的入射功率、回到读写器的电平、余量与读到的次数。',
      ],
      blocks: [
        { kind: 'formula', heading: '单站读写器的余量', text: '回到读写器 = 激励 − 2 × 路损 − 6\n读写器的本机干扰 = 激励 − 20（天线隔离）− 50（接收动态范围）\n余量 = 64 − 2 × 路损', note: '激励在两式中相互抵消。6、20、50 三个数取自未被采纳的文稿（②）。' },
        { kind: 'table', heading: '一秒钟内六张标签的结果', head: ['标签', '距离', '入射功率', '回到读写器', '余量', '一秒读到'], rows: [
          ['Tag 1…4', '15 cm', '−13.72 dBm', '−53.43 dBm', '16.57 dB', '4、6、5、6 次'],
          ['Tag 5', '28 cm', '−19.14 dBm', '−64.28 dBm', '5.72 dB', '2 次'],
          ['Tag 6', '40 cm', '−22.24 dBm', '（未被唤醒）', '—', '0 次'],
        ] },
      ],
      expect: '按 10 dBm 的激励，上电的距离是 0.309 m，可读取的距离是 0.328 m；40 cm 上的 Tag 6 两条线都在外，整整一秒没有任何记录。',
      meaning: '这两个距离来自本仿真器的功率与门限取值（②），草案没有给出这些数值。',
    },
    {
      heading: '提高激励功率',
      variant: 0,
      more: [0],
      steps: [
        '载入「激励 20 dBm」，看 40 cm 上的 Tag 6 是否醒来、是否被读到。',
        '与本课场景比较这一秒读到的次数。',
      ],
      expect: '上电的距离移到 0.978 m，Tag 6 醒来，一秒钟抽取 10 次计数、反射 10 次 RN16；可读取的距离仍是 0.328 m，Tag 6 的余量是 −0.47 dB，一次也没有被解出。它占用的槽使这一秒读到的次数从 23 降到 22。',
      meaning: '读写器的本底随激励一起升高，余量只取决于路损（②）。',
    },
    {
      heading: '一个传输机会只容纳一个槽',
      jump: 1,
      steps: [
        '跳到开启一轮的那帧 Query，逐帧看一个槽里的三帧命令。',
        '数一数一轮 Q = 2 的清点用了几个传输机会。',
      ],
      blocks: [
        { kind: 'formula', heading: '一个槽的三帧命令', text: 'Query 1516 + 16 + ACK 1009 + 16 + Read 1064 + 16 = 3637 µs', note: 'Query 前面带 1 ms 的 WUP-Excitation。开启下一个槽之前还要为可能到来的 RN16 预留 16 + 1009 µs，4 ms 不够，所以留到下一个传输机会。' },
      ],
      expect: 'Q = 2 的一轮要四个传输机会、14.9 ms 才清点完毕。一秒钟内 77 帧命令占用 82.8 ms，也就是 8.3 %。每个传输机会 4 ms，长于 AC_BK 缺省的 2.528 ms TXOP 限制。',
      meaning: '2^Q 个槽、跨传输机会保留计数与 4 ms 的长度都是本仿真器的取法，与草案的单时隙触发不同（②）。',
    },
    {
      heading: '读不出与空槽',
      jump: 4,
      more: [2],
      steps: [
        '跳到第一个读不出任何应答的槽，再统计这一秒四十个槽的结果。',
        '载入「Q = 0：只开一个槽」，比较结果。',
      ],
      expect: '一秒钟 40 个槽里读到 23 个、读不出 9 个、空 8 个；标签一共反射 50 次 RN16。15 cm 与 28 cm 的两张标签同在一个槽里时，近的那张强 10.8 dB，读写器解出它，这一槽记为读到。Q = 0 时五张醒着的标签都抽到 0，10 个槽全部读不出，一次也没读到。',
      meaning: '区分读不出与空槽、两路反射怎样判决，都是本仿真器的取法（②）。',
    },
  ],
  sources: [
    'IEEE P802.11bp 草案：规范框架 11-24/1613r20 的 AM-2（动议 #29）、PM-3（#15）、PM-9（#16）、PM-10（#18）、PM-17（#31）、PM-22（#40）、PM-28（#72）、PM-57（#134）、PM-63（#140）、PM-65（#149）、动议 #167—#170 与 #199—#201（激励字段与应答时间）、MM-10（#52）、MM-29（#111、#112）、FM-9（#105、#141）、FM-25（#145）、FM-35（#210）、FM-44（#239）、FM-45（#241）；草案文本 11-26/1519r5 §39.3.3 与 11-26/1798r1；通过记录见 11-25/1692r50（#87、#98）。',
    '本仿真器的清点过程按提案 11-25/0061r0：EPC Gen2（ISO/IEC 18000-63）的 Query、QueryRep、ACK、2^Q 个槽、计数跨传输机会保留；4 ms 的传输机会与 EPC 的生成方式是本仿真器自己的取值。',
    '功率与门限的取值来自小组讨论过、规范框架没有采纳其数值的文稿：11-23/2038r1（6 dB 反射损耗）、11-24/0537r0（−20 dBm 上电门限）、11-25/0058r1（20 dB 天线隔离、50 dB 接收动态范围）、11-25/0307r0（10 dBm 与 0 dBm 两档激励）、11-26/0120r0（16 µs 命令间隔、2 ms 写入时延）。传播按 Friis 公式计算。',
    'IEEE Std 802.11-2024 §10.23.2.9 与表 9-194（TXOP 限制，AC_BK 缺省 2.528 ms）。',
  ],
  limits: [],
  scenario: () => ampBackscatterScenario(),
  variants: [
    { label: '激励 20 dBm', scenario: () => ampBackscatterScenario({ chargeDbm: 20 }) },
    { label: '回应 1 Mb/s', scenario: () => ampBackscatterScenario({ ulKbps: 1000 }) },
    { label: 'Q = 0：只开一个槽', scenario: () => ampBackscatterScenario({ q: 0 }) },
    { label: '打开 Write', scenario: () => ampBackscatterScenario({ write: true }) },
  ],
  jumps: [
    J('第一次上电', firstBsBoot),
    J('开启一轮的那帧 Query', firstBsQuery),
    J('第一次反射回 EPC', firstBsEpc),
    J('第一个未清点完毕的轮次', firstBsPartialRound),
    J('第一个读不出任何回应的槽', firstBsCollidedSlot),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按草案，接入点收到单站反向散射标签的应答之后要做什么？',
      options: [
        '发一帧 AMP Ack，写出这张标签的标识',
        '不发下行 Ack',
        '发一帧组确认，按时隙写出收到的标签',
      ],
      answer: 1,
      explain: '规范框架 FM-35（动议 #210）：接入点收到单站反向散射终端所征求的应答后，不发下行 Ack。组确认是双基地反向散射用的。',
    },
    {
      q: '哪一项是本仿真器按未被采纳的提案做的，而不是草案的规定？',
      options: [
        'WUP-Excitation 至少 1 ms',
        '标签在命令结束后 16 µs 应答',
        '用 EPC Gen2 的 Query、QueryRep 与 ACK 清点，一轮开启 2^Q 个槽',
      ],
      answer: 2,
      explain: '草案文本 39.3.3 节让触发帧只分配一个时隙、随机接入带 ACWE；规范框架列出的命令是 Select、Read、Write、Authenticate。2^Q 个槽的清点来自提案 11-25/0061r0。',
    },
    {
      q: '把单站读写器的激励从 10 dBm 提高到 20 dBm，可读取距离为什么不变？',
      options: [
        '反射损耗也随之增加了 10 dB',
        '读写器的本底来自自身泄漏的载波，随激励一起升高，余量只取决于路损',
        '标签的反射效率随入射功率下降',
      ],
      answer: 1,
      explain: '回到读写器是「激励 − 2 × 路损 − 6」，本机干扰是「激励 − 70」，两式相减激励消去：余量 = 64 − 2 × 路损。',
    },
  ],
}
