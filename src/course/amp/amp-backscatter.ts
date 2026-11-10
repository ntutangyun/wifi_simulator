/**
 * Tier 2 · M10 · Ambient power IoT (802.11bp) · The backscatter tier.
 *
 * Standard-first since 2026-11-11 (the shape `@uwb-contention` set): ① what the TGbp
 * specification framework and the PDTs fix about mono-static backscatter — the excitation fields
 * and their timing, the PPDUs, the single-slot AMP Trigger with ACWE random access (§39.3.3), the
 * AMP RFID frame that carries the UHF RFID commands, no downlink Ack; ② what this simulator does
 * about each; ③ four guided runs.
 *
 * Rebuilt 2026-11-11 (W7b): the inventory used to tunnel EPC Gen2's Query/QueryRep/ACK slot
 * counter (proposal 11-25/0061r0, not adopted) in a 4 ms TXOP of its own. It is now the draft's:
 * a broadcast AMP Trigger allocating one slot, an AMP Response carrying the 16-bit ID, and an
 * AMP RFID frame carrying the UHF Read command for each ID heard — every TXOP inside the AP's
 * AC_BK TXOP limit (2.528 ms). One mono-static reader on a table, six tags at 15, 28 and 40 cm.
 * Every figure quoted below is read back out of this file and compared with a run in
 * tests/course/amp-backscatter.test.ts.
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
  why: 'P802.11bp 的第二类标签没有发射机：它把接入点（access point, AP）发来的载波反射回去，在反射与不反射之间切换天线（antenna）来形成比特。在单站模式下，接入点在帧之前发一段至少 1 ms 的 WUP-Excitation 为标签供电，在帧之后发一段 BST-Excitation 供标签反射；标签在帧结束后 16 µs（±20 %）应答，接入点不回确认帧（acknowledgement, ACK）。按草案文本，单站的触发帧（Trigger frame）只分配一个上行（uplink, UL）时隙：广播触发帧带会话号与 ACWE，抽到 0 的标签以 AMP Response 帧报出自己的 16 位标识；读写 EPC 等内容的 UHF RFID 命令由 AMP RFID 帧携带。本仿真器照此实现：先用广播触发帧征求标识，再对每个听到的标识发一帧携带 Read 命令的 AMP RFID 帧读回 EPC。每个传输机会（TXOP）都不得超过 AC_BK 的 TXOP 限制 2.528 ms，250 kb/s 下第一帧又带 1 ms 的 WUP-Excitation，所以每个传输机会只放得下一帧触发帧或一帧 Read；Write 的应答要等 2 ms，放不进一个传输机会，本仿真器不发送。能否读到取决于两个互不相关的距离：标签收到的功率能否唤醒它，反射回来的信号能否被解出。读写器的接收本底来自自身泄漏的载波，提高激励功率时回波与本底一同升高，所以唤醒距离增大到三倍多，可读取距离不变。这些功率计算所用的数值全部取自小组讨论过、规范框架没有采纳的文稿。',
  outcomes: [
    '说出草案对单站反向散射规定了什么：激励字段、应答时间、单个时隙的触发帧、AMP RFID 帧、不回确认',
    '说出为什么一个 AC_BK 传输机会只放得下一帧，以及 Write 为什么发不出去',
    '用反射回程的功率预算解释为什么提高激励功率不能延长可读取距离',
    '一张标签读不到时，判断先怀疑它是否上电，还是先怀疑回程信号',
  ],
  needs: ['amp-slots'],
  terms: [
    { term: 'backscatter', plain: '反向散射：标签自己不产生载波，只把接入点的载波反射回去，用反射的开与关表示比特' },
    { term: 'mono-static', plain: '单站：发送激励和接收反射的是同一台设备的两根天线，因此它在发送的同时也收到自己的信号' },
    { term: 'WUP-Excitation', plain: '帧之前的那段激励，为标签供电，草案要求至少 1 ms' },
    { term: 'BST-Excitation', plain: '帧之后的那段激励：标签依靠它维持供电，也依靠它反射应答' },
    { term: 'EPC', plain: '电子产品代码：标签的全局标识，草案把它作为反向散射标签的全局标识' },
  ],
  standard: [
    { heading: '依据（11-24/1613r20；11-26/1519r5；11-26/1889r4；11-26/1798r1；11-26/1520r3）', text: 'P802.11bp 仍是草案。下面的规则来自规范框架 11-24/1613r20 已通过的动议，以及几份草案文本：11-26/1519r5 的 39.3.3 节（单站反向散射的触发过程）、11-26/1889r4 的 39.4 节（信道接入）、11-26/1798r1（单站反向散射的帧交换序列）与 11-26/1520r3（AMP RFID 帧）。TGbp 在 2026 年 9 月会议上以意向投票 #87、#90 与 #98 无异议同意把前三份文本并入下一版草案（11-25/1692r50）。' },
    { heading: '单站反向散射（规范框架 PM-3、AM-2、PM-28）', text: '草案为 2.4 GHz 定义至少一种近距离单站反向散射的模式（动议 #15）。反向散射的非 AP AMP 站点（station, STA）只能接收下行（downlink, DL）AMP PPDU（PHY protocol data unit），以反向散射方式发送上行（#29）。时钟误差以百万分之几（parts per million, ppm）计，在接收与反射时上限都是 100 000 ppm，即 10 %（#72）。' },
    { heading: '激励字段与应答时间（规范框架 PM-72—PM-75、PM-86—PM-88；动议 #167—#170、#199—#201）', text: '单站模式的下行 PPDU 里，AMP-Sync 之前的激励称为 WUP-Excitation，数据之后的激励称为 BST-Excitation（#167）。WUP-Excitation 至少 1 ms（#168）；2.4 GHz 下 BST-Excitation 至少 16 µs（#169）。即时应答的时间为 16 µs，误差 ±20 %（#170）。对即时应答的帧，BST-Excitation 至少为 T1 × 1.2 + T4 × 1.1，T1 = 16 µs，T4 为上行 PPDU 的名义长度（#200）。延迟应答时，标签在 [T3 × 0.9 − 1 µs，T3 × 1.1 + 1 µs] 内开始应答，BST-Excitation 至少为 T3 × 1.1 + 1 µs + T4 × 1.1（#199、#201）。' },
    { heading: 'PPDU（规范框架 PM-9、PM-10、PM-63、PM-65、PM-17、PM-22、PM-57）', text: '发给反向散射终端的下行速率只有 250 kb/s（#16）。2.4 GHz 下单站反向散射的下行 AMP-Sync 为 [0 1 1 1 1 0 1 0]，码片（chip）长 2 µs（#140、#18）；发给单站反向散射终端的下行 PPDU 没有 AMP-SIG（#149）。上行速率为 250 kb/s 与 1 Mb/s（#31），码片分别长 2 µs 与 0.5 µs（#40）；上行 AMP-Sync 的结构为 [S, S, S]，S = [1 1 0 1 0 1 0 0]（#134）。' },
    { heading: '触发帧与随机接入（11-26/1519r5 §39.3.3；11-26/1889r4 §39.4）', text: '发给单站反向散射终端的 AMP 触发帧必须给出上行速率与时隙长度，而且只分配一个上行时隙；用于随机接入的触发帧还要带会话号与 ACWE，ACW = 2^ACWE − 1。广播触发帧的 ID 字段为广播标识（例如 0xFFFF），单播触发帧的 ID 字段为所寻址终端的标识。接入点可以先用随机接入的广播触发帧征求终端的标识，再用单播触发帧向某个终端征求应答。收到随机接入触发帧的终端在 [0, ACW] 里均匀随机取一个新的 ABOC，ABOC 小于时隙数时在第 ABOC + 1 个时隙作答，否则不作答；单站反向散射的时隙数为 1（动议 #105）。' },
    { heading: '命令、标识与 AMP RFID 帧（规范框架 MM-10、MM-29、FM-44、FM-45、FM-25；11-26/1798r1；11-26/1520r3）', text: '反向散射使用 UHF RFID 标准逻辑接口的一个子集，命令由 802.11bp 帧携带（#52）；必须支持 Select、Read、Write、Authenticate 四条命令，其他命令待定（#111、#112）。AMP RFID 帧携带这些命令与标签的应答，命令本身由 ISO/IEC 18000-63 定义（#239）。11-26/1520r3 给出它的格式：媒体访问控制（medium access control, MAC）帧头（MAC header）32 位，其中帧控制（Frame Control）8 位、ID 16 位、类型相关控制 8 位，帧校验 16 位；单播时 ID 为收发终端的标识。终端的 16 位标识由其全局标识的 CRC16 得出（#145）。接入点已经知道终端的全局标识时，可以在一个传输机会（transmit opportunity, TXOP）里先发一帧带有全部或部分 EPC 的单播帧（即 Select），再发其他帧（#241，11-26/1798r1）。命令需要处理时延时，接入点在同一传输机会里等待这段时延再接收应答，剩余的传输机会必须够用（11-26/1798r1）。' },
    { heading: '确认（规范框架 FM-35）', text: '接入点收到单站反向散射终端所征求的应答之后，不发下行 Ack（#210）。' },
    { heading: '传输机会的长度（IEEE Std 802.11-2024 §10.23.2.9，表 9-194）', text: 'TXOP 持有者必须保证一次传输机会不超过 TXOP 限制；接入点的限制在 dot11QAPEDCATable 中，AC_BK 的缺省值取表 9-194，2.4 GHz 下为 2.528 ms。' },
    { kind: 'steps', heading: '一次单站反向散射的交换，按草案：逐步说明', items: [
      '接入点以 AC_BK 取得传输机会，发出下行 PPDU：WUP-Excitation（至少 1 ms）、AMP-Sync、数据、BST-Excitation（#167—#169）。',
      '随机接入时，广播触发帧只分配一个上行时隙，带会话号与 ACWE；ABOC 为 0 的终端作答（§39.3.3，§39.4）。',
      '终端在帧结束后 16 µs（±20 %）开始反射，应答落在 BST-Excitation 之内（#170、#200）。',
      '接入点不回 Ack（#210）；需要读写时，用 AMP RFID 帧携带 Select、Read、Write 等命令（#239、#241）。',
      '命令需要处理时延时，接入点在同一传输机会里等待，BST-Excitation 按延迟应答的公式加长（#199、#201；11-26/1798r1）。',
    ] },
  ],
  implementation: [
    { topic: '征求标识', standard: '广播触发帧只分配一个时隙，带会话号与 ACWE；ABOC 小于时隙数的终端作答（§39.3.3，§39.4）', sim: '照此实现：广播 AMP 触发帧的 ID 为 0xFFFF；每张醒着的标签每帧触发帧重新抽取 ABOC，抽到 0 就反射一帧 AMP Response，带回自己的 16 位标识，不保留任何计数。', kind: 'faithful' },
    { topic: '读回 EPC', standard: 'AMP RFID 帧携带 UHF RFID 命令，单播时 ID 为终端的标识（#239，11-26/1520r3）', sim: '照此实现：对每个听到的标识发一帧 AMP RFID 帧，帧体（Frame Body）是 Read 命令；标签在同一 PPDU 的 BST-Excitation 里反射一帧 AMP RFID 帧，帧体是 Read 应答。', kind: 'faithful' },
    { topic: 'Read 读什么', standard: 'Read 的参数由 ISO/IEC 18000-63 定义，读哪一个存储区由上层决定', sim: '只读 EPC 存储区：命令帧体 8 个字节，应答帧体 17 个字节（96 位 EPC 加应答头、句柄与 16 位循环冗余校验（cyclic redundancy check, CRC），按位数取整）。同一次盘点里读过的标签不再读。', kind: 'choice' },
    { topic: 'Select、Write 与 Authenticate', standard: '必须支持 Select、Read、Write、Authenticate（#111、#112）', sim: '不发送。读写器直接用听到的标识寻址，不发 Select；Write 的应答时延取 2 ms（11-26/0120r0），BST-Excitation 就要 2.2 ms 以上，连同帧的其余部分放不进 2.528 ms 的传输机会；Authenticate 没有实现。', kind: 'absent' },
    { topic: '一次传输机会的长度', standard: '不得超过 TXOP 限制；AC_BK 缺省 2.528 ms（IEEE Std 802.11-2024 §10.23.2.9，表 9-194）', sim: '照此实现：每个传输机会从 CTS-to-self（CTS to self）起都在 2.528 ms 之内，CTS-to-self 预留 2478 µs。250 kb/s 下每个传输机会只放得下一帧触发帧或一帧 Read。', kind: 'faithful' },
    { topic: '一次盘点跨传输机会', standard: '草案没有规定一次盘点发多少帧触发帧', sim: '一次盘点发 4 帧触发帧（场景参数），一个传输机会放不下的留到下一次 AC_BK 传输机会，沿用同一个会话号；听到的标识也留到下一次传输机会读取。每 100 ms 开始一次新的盘点。', kind: 'choice' },
    { topic: '会话号', standard: '会话号标识一次随机接入会话（§39.3.3），草案没有规定终端据此做什么', sim: '标签不看会话号：已被读过的标签抽到 0 时照样作答。', kind: 'choice' },
    { topic: 'WUP-Excitation', standard: '至少 1 ms（#168）', sim: '每个传输机会的第一帧带 1 ms 的 WUP-Excitation，其后的帧不带。', kind: 'faithful' },
    { topic: 'BST-Excitation', standard: '即时应答至少 T1 × 1.2 + T4 × 1.1；延迟应答至少 T3 × 1.1 + 1 µs + T4 × 1.1（#200、#201）', sim: '照此计算，T1 = 16 µs。', kind: 'faithful' },
    { topic: '帧间间隔', standard: '接入点在两帧之间的转向时间，规范框架没有给出数值', sim: '两帧之间 16 µs（取自 11-26/0120r0）。', kind: 'value' },
    { topic: '不回 Ack', standard: '收到单站反向散射终端的应答后不发下行 Ack（#210）', sim: '照此实现：接入点只发触发帧与 AMP RFID 帧，不发 AMP Ack。', kind: 'faithful' },
    { topic: '速率与同步', standard: '下行 250 kb/s；上行 250 kb/s 或 1 Mb/s，码片 2 µs 或 0.5 µs；上行 AMP-Sync 为 [S, S, S]（#16、#31、#40、#134）', sim: '照此计时：上行 AMP-Sync 24 个码片。', kind: 'faithful' },
    { topic: '帧头宽度', standard: 'AMP RFID 帧的帧头 32 位、帧校验 16 位（11-26/1520r3）；触发帧与 AMP Response 的字段宽度草案尚未全部给出', sim: 'AMP RFID 帧照此取 4 + 2 个字节；触发帧与 AMP Response 沿用自行发射那一层的取值（帧头 5 个字节、CRC 2 个字节、触发帧帧体 6 个字节）。', kind: 'value' },
    { topic: '功率与门限的取值', standard: '规范框架没有给出', sim: '反射损耗 6 dB（11-23/2038r1）、天线隔离 20 dB 与接收动态范围 50 dB（11-25/0058r1）、上电门限 −20 dBm（11-24/0537r0）、250 kb/s 应答需要 3 dB 信噪比（signal-to-noise ratio, SNR）；激励 10 dBm 与 0 dBm 取自 11-25/0307r0。这几份文稿都未被规范框架采纳。', kind: 'value' },
    { topic: '读不出与空时隙', standard: '草案没有规定', sim: '读写器在 BST-Excitation 期间做能量检测（energy detection, ED），区分“有反射但读不出”与“没有反射”。', kind: 'choice' },
    { topic: '同一时隙里的多路反射', standard: '草案不规定接收机的判决', sim: '较强的一路信噪比达到门限、且比另一路强得多时可以解出；电平相同的几路都读不出。', kind: 'value' },
    { topic: '传播与上电', standard: '标准不规定信道模型', sim: '按 Friis 自由空间公式计算，2.4 GHz 下第一米 40.2 dB，5 cm 以内按 5 cm 计；上电是一条硬门限，低于 −20 dBm 的标签不产生任何记录。', kind: 'choice' },
    { topic: 'EPC 与 16 位标识', standard: '16 位标识由全局标识的 CRC16 得出（#145）', sim: '96 位的 EPC 由节点名称生成。', kind: 'value' },
  ],
  labs: [
    {
      heading: '哪些标签被唤醒，哪些能被读到',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次上电：同一时刻有五张标签各记录一条上电记录。',
        '运行满一秒，对照下表读出每张标签的入射功率、回到读写器的电平、余量与读回 EPC 的次数。',
      ],
      blocks: [
        { kind: 'formula', heading: '单站读写器的余量', text: '回到读写器 = 激励 − 2 × 路损 − 6\n读写器的本机干扰 = 激励 − 20（天线隔离）− 50（接收动态范围）\n余量 = 64 − 2 × 路损', note: '激励在两式中相互抵消。6、20、50 三个数取自未被采纳的文稿（②）。' },
        { kind: 'table', heading: '一秒钟内六张标签的结果', head: ['标签', '距离', '入射功率', '回到读写器', '余量', '一秒读到'], rows: [
          ['Tag 1…4', '15 cm', '−13.72 dBm', '−53.43 dBm', '16.57 dB', '4、5、4、3 次'],
          ['Tag 5', '28 cm', '−19.14 dBm', '−64.28 dBm', '5.72 dB', '1 次'],
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
        '与本课场景比较这一秒读回的 EPC 个数。',
      ],
      expect: '上电的距离移到 0.978 m，Tag 6 醒来，一秒钟抽取 40 次 ABOC、反射 18 次 AMP Response；可读取的距离仍是 0.328 m，Tag 6 的余量是 −0.47 dB，一次也没有被解出。它的反射与别的标签相撞，使这一秒读回的 EPC 从 17 个降到 16 个。',
      meaning: '读写器的本底随激励一起升高，余量只取决于路损（②）。',
    },
    {
      heading: '一个传输机会只容纳一帧',
      jump: 1,
      steps: [
        '跳到开启盘点的那帧触发帧，看它前后的 CTS-to-self 与下一次传输机会。',
        '数一数第一次盘点用了几个传输机会。',
      ],
      blocks: [
        { kind: 'formula', heading: '250 kb/s 下一个传输机会里的帧', text: '50 + 10 + 触发帧 1788.4 = 1848.4 µs；再加 16 + 不带 WUP 的触发帧 788.4 = 2652.8 µs > 2528 µs\n50 + 10 + Read 2383.6 = 2443.6 µs', note: '每个传输机会的第一帧都带 1 ms 的 WUP-Excitation；触发帧之后的 BST-Excitation 按 AMP Response 计算，Read 之后的按 Read 应答计算，所以 Read 的 PPDU 更长。' },
      ],
      expect: '第一次盘点用 7 个传输机会、15.6 ms 才完成：4 帧触发帧各占一个，听到的 3 个标识各用一个读回 EPC。一秒钟内 57 帧占用 112.1 ms，也就是 11.2 %。每个传输机会都在 AC_BK 的 2.528 ms TXOP 限制之内。',
      meaning: '每个传输机会不超过 TXOP 限制照标准（①）；一次盘点发几帧触发帧、跨几个传输机会是本仿真器的取法（②）。',
    },
    {
      heading: '读不出与空时隙',
      jump: 4,
      more: [2],
      steps: [
        '跳到第一个读不出任何应答的时隙，再统计这一秒四十帧触发帧的结果。',
        '载入「ACWE = 0：每张标签都作答」，比较结果。',
      ],
      expect: '一秒钟 40 帧触发帧里，听到标识 19 次、读不出 11 次、空 10 次；标签一共反射 53 次 AMP Response。15 cm 与 28 cm 的两张标签在同一时隙作答时，近的那张强 10.8 dB，读写器解出它，这一时隙记为听到标识。ACWE = 0 时五张醒着的标签每帧都抽到 0，40 帧触发帧全部读不出，一个标识也没听到。',
      meaning: '区分读不出与空时隙、几路反射怎样判决，都是本仿真器的取法（②）；ACWE 怎样选，草案不管（①）。',
    },
  ],
  sources: [
    'IEEE P802.11bp 草案：规范框架 11-24/1613r20 的 AM-2（动议 #29）、PM-3（#15）、PM-9（#16）、PM-10（#18）、PM-17（#31）、PM-22（#40）、PM-28（#72）、PM-57（#134）、PM-63（#140）、PM-65（#149）、动议 #167—#170 与 #199—#201（激励字段与应答时间）、MM-10（#52）、MM-29（#111、#112）、FM-9（#105、#141）、FM-25（#145）、FM-35（#210）、FM-44（#239）、FM-45（#241）；草案文本 11-26/1519r5 §39.3.3、11-26/1889r4 §39.4、11-26/1798r1 与 11-26/1520r3；通过记录见 11-25/1692r50（#87、#90、#98）。',
    'IEEE Std 802.11-2024 §10.23.2.9 与表 9-194（TXOP 限制，AC_BK 缺省 2.528 ms）；附录 C 的 dot11QAPEDCATable。',
    '功率与门限的取值来自小组讨论过、规范框架没有采纳其数值的文稿：11-23/2038r1（6 dB 反射损耗）、11-24/0537r0（−20 dBm 上电门限）、11-25/0058r1（20 dB 天线隔离、50 dB 接收动态范围）、11-25/0307r0（10 dBm 与 0 dBm 两档激励）、11-26/0120r0（16 µs 帧间间隔、2 ms 写入时延）。传播按 Friis 公式计算；EPC 的生成方式、Read 读 EPC 存储区、一次盘点 4 帧触发帧是本仿真器的取值与取法。',
    '本仿真器此前按未被采纳的提案 11-25/0061r0 用 EPC Gen2 的 Query、QueryRep 与 ACK 清点，一个传输机会 4 ms；这一做法已经去掉。',
  ],
  limits: [],
  scenario: () => ampBackscatterScenario(),
  variants: [
    { label: '激励 20 dBm', scenario: () => ampBackscatterScenario({ chargeDbm: 20 }) },
    { label: '回应 1 Mb/s', scenario: () => ampBackscatterScenario({ ulKbps: 1000 }) },
    { label: 'ACWE = 0：每张标签都作答', scenario: () => ampBackscatterScenario({ acwe: 0 }) },
  ],
  jumps: [
    J('第一次上电', firstBsBoot),
    J('开启盘点的那帧触发帧', firstBsQuery),
    J('第一次反射回 EPC', firstBsEpc),
    J('第一个未完成的盘点', firstBsPartialRound),
    J('第一个读不出任何回应的时隙', firstBsCollidedSlot),
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
      q: '250 kb/s 下，为什么一个 AC_BK 传输机会只放得下一帧触发帧或一帧 Read？',
      options: [
        '草案规定每个传输机会只能发一帧',
        '第一帧带 1 ms 的 WUP-Excitation，再加一帧就超过 2.528 ms 的 TXOP 限制',
        '标签每次上电只能应答一次',
      ],
      answer: 1,
      explain: '触发帧连同 WUP-Excitation 与 CTS-to-self 已占 1848.4 µs，再发一帧不带 WUP 的触发帧要到 2652.8 µs，超过表 9-194 的 2.528 ms。',
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
