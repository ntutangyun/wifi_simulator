/**
 * Wi-Fi Tier 3 · M12 · 2.4 GHz 链路 · what the standard changes on this band, and what the
 * simulator adds.
 *
 * Standard-first shape (2026-11-11): ① what IEEE Std 802.11-2024 specifies for a 2.4 GHz
 * station (Table 18-5 and Table 27-61 timing, Equations 10-6 and 10-7, §10.3.8 signal
 * extension, §10.3.2.3.7 EIFS, §10.3.2.11 AckTimeout, §18.4.6 and §27.3.22.6.3 CCA, §4.3.15 and
 * §4.3.16 channel widths, 802.11be-2024 §4.3.16a); ② how this engine implements each — since
 * 2026-11-11 (W6) EIFS (Equation 10-7 with a 1 Mb/s DSSS Ack, 342 µs) and the ACK timeout
 * (aRxPHYStartDelay 24 µs for an HE station, Table 27-61) follow the standard — and the one value
 * the standard does not cover at all (the −6.5 dB band offset, a propagation model); ③ five
 * guided runs.
 *
 * The audit behind ② found that the old lesson called the 40 MHz cap a model value. It is the
 * standard: an HE or EHT station in the 2.4 GHz band supports 20 MHz (mandatory) and 40 MHz
 * (optional) and nothing wider.
 *
 * Every figure the lesson prints is read back out of its own text in
 * tests/course/link-2g.test.ts and compared with an engine run. Throughput figures are means
 * over ten or twenty seeds: flipping the band flips the station's virtual id and with it the
 * backoff stream, so a single-seed comparison measures the draw, not the band.
 */
import { type Lesson, J } from '../lessonKit'
import { link2gScenario } from '../wifiScenes'

export const link2g: Lesson = {
  id: 'link-2g',
  module: 12,
  title: '2.4 GHz 链路——换频段不改变交换时长，改变的是站点能否相互收到',
  why: '把同一套 Wi-Fi 设备从 5 GHz 移到 2.4 GHz，IEEE Std 802.11-2024 规定的几个时间常数随之改变：短帧间间隔（short interframe space, SIFS）从 16 微秒变为 10 微秒，分布式帧间间隔（DCF interframe space, DIFS）随之从 34 微秒变为 28 微秒，每个 PPDU（PHY protocol data unit）之后还要多出 6 微秒的信号扩展。一次完整的交换里帧间间隔与 PPDU 的个数相同，每个间隔缩短的时间正好等于每个 PPDU 增加的时间，所以同一次交换在两条链路（link）上的时长完全相同。标准还规定，HE 与 EHT 站点（station, STA）在 2.4 GHz 上最宽只能使用 40 MHz 的信道带宽（channel width）。电波怎样传播不属于标准的内容：本仿真器给 2.4 GHz 的每条路径统一减少 6.5 dB 的路径损耗（path loss），这在远处相当于两到三级调制与编码方式（modulation and coding scheme, MCS），在路由器旁边一级也换不来。真正改变结果的是站点之间能否相互收到：本课的楼梯间里，两台笔记本之间的电平在 5 GHz 上低于 −82 dBm 的前导检测（preamble detection）门限，两台互为隐藏节点（hidden station）；在 2.4 GHz 上高出门限，收到对方的帧却解不出，于是按标准改为等待扩展帧间间隔（extended interframe space, EIFS），两台开始相互避让，路由器收到的帧增加到十一倍。这个场景是有意布置在门限附近的。方向相反的是带宽：请求 160 MHz 的 Wi-Fi 7 笔记本在 2.4 GHz 上只得到 40 MHz，选中的 MCS 高出四级，吞吐仍低近一成。',
  outcomes: [
    '说出标准为 2.4 GHz 规定的 SIFS、时隙（slot time）、信号扩展取值，并算出同一次交换在两条链路上的时长',
    '分清哪些是标准的规定（40 MHz 上限、EIFS 的条件），哪些是本仿真器的取值（6.5 dB 的频段路损偏移、−82 dBm 的硬门限）',
    '在时间轴上找到 EIFS 记录，并说明它为什么只在 2.4 GHz 那一边出现',
  ],
  needs: ['ifs', 'cca', 'hidden', 'width'],
  terms: [
    { term: 'signal extension', plain: '信号扩展：2.4 GHz 上某些格式的 PPDU 之后紧跟的一段 6 微秒的静默期，计入这个 PPDU 的空口时间，目的是让只能按旧格式计算时长的设备正确设置网络分配向量。5 GHz 与 6 GHz 上它是 0' },
    { term: 'ERP', plain: '扩展速率物理层（extended rate PHY）：IEEE Std 802.11-2024 第 18 章为 2.4 GHz 定义的物理层，在 DSSS/CCK 速率之上加入 OFDM 速率' },
    { term: 'band path-loss offset', plain: '频段路损偏移：本仿真器给整张链路表统一加的一个常数，2.4 GHz 是 −6.5 dB、6 GHz 是 +1.2 dB、5 GHz 是 0；不随距离或墙体变化，标准中没有这个量' },
  ],
  standard: [
    { heading: '2.4 GHz 上的时间常数（§18.5.4 表 18-5；§27.4.4 表 27-61）', text: 'ERP 的特性表规定：aSIFSTime 为 10 µs；aSlotTime 即时隙，有长短两种，长时隙 20 µs、短时隙 9 µs；aSignalExtension 为 6 µs；ERP 中正交频分复用（orthogonal frequency-division multiplexing, OFDM）格式即 ERP-OFDM 的 aRxPHYStartDelay 为 20 µs；aCWmin(0) 为 31、aCWmin(1) 为 15，aCWmax 为 1023。HE 物理层（physical layer, PHY）的特性表按频段给值：在 2.4 GHz 上 aSIFSTime 为 10 µs、aSignalExtension 为 6 µs、时隙有长 20 µs 与短 9 µs 两种；在 5 GHz 与 6 GHz 上 aSIFSTime 为 16 µs、aSignalExtension 为 0、时隙为 9 µs；aRxPHYStartDelay 不分频段，为 24 µs。' },
    { kind: 'table', heading: '同一台 HE 站点在两个频段上的取值（表 27-61）', head: ['特性', '2.4 GHz', '5 GHz'], rows: [
      ['aSIFSTime', '10 µs', '16 µs'],
      ['aSlotTime', '长 20 µs，短 9 µs', '9 µs'],
      ['aSignalExtension', '6 µs', '0'],
      ['aRxPHYStartDelay', '24 µs', '24 µs'],
    ] },
    { heading: '用长时隙还是短时隙（§9.4.1.4）', text: '接入点（access point, AP）在信标（Beacon）等帧的能力信息字段里把 Short Slot Time 子字段置 1，表示这个基本服务集（basic service set, BSS）当前使用短时隙；置 0 则使用长时隙。' },
    { heading: '由时间常数导出的三个间隔（§10.3.7，§10.3.2.11）', text: 'DIFS = aSIFSTime + 2 × aSlotTime（式 10-6）。EIFS = aSIFSTime + AckTxTime + DIFS（式 10-7），其中 AckTxTime 是以物理层最低的强制速率（mandatory rate）或 MCS 发送一个确认帧（acknowledgement, ACK）所需的时间，含前导码（preamble）、物理层头与物理层附加的部分。发出一个需要确认的 MPDU（MAC protocol data unit）之后，发送端等待 ACK 超时（ACK timeout）间隔 aSIFSTime + aSlotTime + aRxPHYStartDelay；期间没有检测到任何帧的开始，就判定这次发送失败。' },
    { heading: '信号扩展（§10.3.8，§18.5.3.2）', text: 'NON_HT 格式中的 ERP-OFDM 与 NON_HT_DUP_OFDM，以及 HT_MF、HT_GF、HE_SU、HE_MU、HE_ER_SU、HE_TB 格式的发送之后，紧跟一段时长为 aSignalExtension 的静默期，RIFS 发送除外；目的是让第 16 章的站点正确设置网络分配向量（network allocation vector, NAV）。ERP-OFDM 的 TXTIME 公式（式 18-1）把这段时间计入 PPDU 的时长。§10.3.7 规定，所有以发送结束为起点的介质（medium）时间都从 PPDU[+SigExt] 的结束算起。' },
    { heading: '什么时候等 EIFS（§10.3.2.3.7）', text: '分布式协调功能（distributed coordination function, DCF）接收一个 PPDU[+SigExt] 之后，如果物理层报告接收出错，或者帧校验序列（frame check sequence, FCS）不正确，就在介质变为空闲后等待 EIFS 再发送；增强型分布式信道接入（enhanced distributed channel access, EDCA）对应地以按接入类别（access category, AC）取值的仲裁帧间间隔（arbitration interframe space, AIFS）代替 DIFS，即等待 EIFS − DIFS + AIFS[AC]。在此期间正确收到一帧，EIFS 立即结束。EIFS 的用意是给另一个站点留出足够的时间，确认这个站点没有正确收到的那一帧。' },
    { heading: '空闲信道评估（clear channel assessment, CCA）（§18.4.6，§27.3.22.6.3）', text: 'ERP 站点在接收端电平不低于 −82 dBm 时检测到 ERP-OFDM 信号的开头，要在 aCCATime 内报告忙，短时隙时检测概率至少 90%；任何高于 −62 dBm 的能量也要报告忙，即能量检测（energy detection, ED）。HE 站点在 2.4 GHz 上对非 HT PPDU 按 §18.4.6 判断，对主 20 MHz 信道内功率不低于 −82 dBm 的 HE PPDU 开头同样报告忙。' },
    { heading: 'ERP 的强制速率（§18.1.2）', text: 'ERP 在第 15、16 章的 DSSS 与 CCK 速率之上，加入第 17 章的 OFDM 速率。1、2、5.5、6、11、12、24 Mb/s 的收发能力是强制的。' },
    { heading: '哪些站点能在 2.4 GHz 上工作，用多宽（§4.3.15，§4.3.16；IEEE Std 802.11be-2024 §4.3.16a）', text: 'VHT 站点只工作在 5 GHz。HE 站点在 2.4 GHz 上同时是 HT 站点，20 MHz 的工作带宽是强制的，40 MHz 是可选的；EHT 站点在 2.4 GHz 上同样只有 20 MHz（强制）与 40 MHz（可选）两种。更宽的 80、160、320 MHz 只定义在 5 GHz 与 6 GHz 上。' },
    { kind: 'steps', heading: '2.4 GHz 上的一次交换，按标准：逐步说明', items: [
      '介质空闲满 DIFS（10 + 2 × 9 = 28 µs，短时隙），退避（backoff）计数到零，站点发出数据帧（data frame）的 PPDU，PPDU 之后紧跟 6 µs 的信号扩展（§10.3.7，§10.3.8）。',
      '接收端从 PPDU[+SigExt] 的结束算起，等待 aSIFSTime = 10 µs，发出确认帧；确认帧的 PPDU 之后同样有 6 µs 的信号扩展。',
      '发送端在 ACK 超时间隔内检测到确认帧的开头，就等它接收完；收到正确的确认帧，这次交换成功（§10.3.2.11）。',
      '旁边的第三个站点如果检测到了这个 PPDU 的开头、却没能正确解出，就在介质变为空闲后改为等待 EIFS 再竞争（§10.3.2.3.7）。',
    ] },
  ],
  implementation: [
    { topic: 'SIFS、时隙与信号扩展', standard: '2.4 GHz：10 µs、9 µs（短时隙）、6 µs；5 GHz：16 µs、9 µs、0（表 18-5，表 27-61）', sim: '照此取值；每个 PPDU 的空口时间（airtime）都包含信号扩展，同一个 1 528 字节的数据帧在 2.4 GHz 上比 5 GHz 长 6.0 µs。', kind: 'faithful' },
    { topic: '长时隙', standard: '接入点通过 Short Slot Time 子字段决定使用长时隙 20 µs 还是短时隙 9 µs（§9.4.1.4）', sim: '2.4 GHz 上固定使用 9 µs 的短时隙，不建模长时隙，也没有通告它的信标。', kind: 'value' },
    { topic: 'DIFS', standard: 'aSIFSTime + 2 × aSlotTime（式 10-6）', sim: '2.4 GHz 上 28 µs，5 GHz 上 34 µs。', kind: 'faithful' },
    { topic: 'EIFS 的启用条件', standard: '接收出错或帧校验序列不正确之后（§10.3.2.3.7）', sim: '照此处理：检测到前导码却没能解出一帧，介质空闲后就等待 EIFS。', kind: 'faithful' },
    { topic: 'EIFS 的长度', standard: 'aSIFSTime + AckTxTime + DIFS，AckTxTime 以物理层最低的强制速率计算（式 10-7）；ERP 的强制速率最低为 1 Mb/s（§18.1.2）', sim: '照此：2.4 GHz 上按 1 Mb/s 的 DSSS 确认帧计算：10 + 304 + 28 = 342 µs，其中确认帧 304 µs，即长前导码与物理层头 192 µs，加 14 字节 112 µs（表 10-8）。本仿真器不发送 DSSS 帧，这个速率只用于算出 EIFS。', kind: 'faithful' },
    { topic: 'ACK 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay（§10.3.2.11）；HE 站点的 aRxPHYStartDelay 为 24 µs（表 27-61）', sim: '照此：aRxPHYStartDelay 按站点的物理层取值，HE 站点为 24 µs。本课的 HE 站点在 2.4 GHz 上等 10 + 9 + 24 = 43 µs，在 5 GHz 上等 16 + 9 + 24 = 49 µs。', kind: 'faithful' },
    { topic: '前导检测', standard: '电平不低于 −82 dBm 时，在 aCCATime 内以一定概率报告忙（§18.4.6，§27.3.22.6.3）', sim: '−82 dBm 是一条硬门限：高于它一定检测到，低于它一定检测不到，没有检测概率，也没有检测时延。', kind: 'choice' },
    { topic: '能量检测的范围', standard: 'HE 站点在主 20 MHz 信道内按 −62 dBm 判断（§27.3.22.6.3）', sim: '照此：把落在主 20 MHz 信道内的功率与 −62 dBm 比较；本课里能量检测从未被触发。', kind: 'faithful' },
    { topic: '频段路损偏移', standard: '标准不定义电波传播', sim: '整张链路表统一加一个常数：2.4 GHz −6.5 dB，5 GHz 0，6 GHz +1.2 dB，不随距离与墙体材质变化（simulation.ts 的 LINK_EXTRA_LOSS_DB）。', kind: 'value' },
    { topic: '选级', standard: '速率切换算法不在标准范围之内（§10.6.1）', sim: '取平均信噪比（signal-to-noise ratio, SNR）减去 3 dB 后仍满足的最高一级；频段路损偏移改变的就是这个平均信噪比。', kind: 'choice' },
    { topic: '2.4 GHz 的带宽上限', standard: 'HE、EHT 站点在 2.4 GHz 上只有 20 MHz 与 40 MHz（§4.3.16；802.11be-2024 §4.3.16a）', sim: '2.4 GHz 链路的带宽取两端请求值中较窄的那个，并且不超过 40 MHz。', kind: 'faithful' },
    { topic: 'Wi-Fi 5 站点', standard: 'VHT 站点只工作在 5 GHz（§4.3.15）', sim: '场景里写着 2.4 GHz 的 VHT 站点仍放在 5 GHz 链路上；编辑器对 Wi-Fi 5 站点不提供频段选项。', kind: 'faithful' },
    { topic: 'DCF 还是 EDCA', standard: '支持服务质量（quality of service, QoS）的站点按接入类别等待 AIFS[AC]（§10.3.2.3.6）', sim: '本课所有场景关闭 EDCA，HE 站点也按 DCF 等待 DIFS，这样两个频段的 DIFS 差额直接出现在记录里。', kind: 'differs' },
    { topic: 'DSSS、CCK 与保护机制', standard: '1、2、5.5、11 Mb/s 是 ERP 的强制速率（§18.1.2）；有旧设备在场时需要保护机制', sim: '未实现：2.4 GHz 上只有 OFDM 一类格式，没有 DSSS/CCK 速率、长前导码，也没有为旧设备设置的保护。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '同一次交换的四段',
      variant: 2,
      jump: 0,
      more: [1],
      steps: [
        '载入「一台站点 · 2.4 GHz」，跳到第一个 DIFS，读出 DIFS、数据 PPDU、SIFS 与确认帧 PPDU 四段的长度。',
        '切换到「一台站点 · 5 GHz」，读出同样的四段，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '一次零退避的交换，逐段实测（桌上那台笔记本，两边都是 MCS 11）', head: ['这一段', '5 GHz', '2.4 GHz', '差'], rows: [
          ['DIFS', '34.0 µs', '28.0 µs', '−6.0'],
          ['数据 PPDU（1 532 字节）', '146.4 µs', '152.4 µs', '+6.0'],
          ['SIFS', '16.0 µs', '10.0 µs', '−6.0'],
          ['确认帧 PPDU（14 字节）', '28.0 µs', '34.0 µs', '+6.0'],
          ['合计', '224.4 µs', '224.4 µs', '0'],
        ] },
      ],
      expect: '两个间隔各短 6.0 µs，两个 PPDU 各长 6.0 µs，合计都是 224.4 µs；两边选中的都是 MCS 11。',
      meaning: 'DIFS 与 SIFS 来自表 27-61 与式 10-6，6 µs 来自信号扩展（①）；一次交换里间隔与 PPDU 个数相同，所以差额的净和为零（②中的前三行都照标准）。数据 PPDU 的 1 532 字节，是 1 528 字节的数据帧加上 4 字节的定界符（MPDU delimiter）。',
    },
    {
      heading: '启用聚合之后仍然相同',
      variant: 4,
      jump: 1,
      more: [3],
      steps: [
        '载入「启用聚合 · 2.4 GHz」，跳到第一帧数据，读出这个聚合 MPDU（aggregate MPDU, A-MPDU）的长度和其后块确认（block acknowledgement, BlockAck）的长度。',
        '切换到「启用聚合 · 5 GHz」，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '一个包含 20 个 MSDU（MAC service data unit）的 A-MPDU，一个块确认', head: ['这一段', '5 GHz', '2.4 GHz', '差'], rows: [
          ['DIFS', '34.0 µs', '28.0 µs', '−6.0'],
          ['聚合 PPDU（30 718 字节）', '1 774.4 µs', '1 780.4 µs', '+6.0'],
          ['SIFS', '16.0 µs', '10.0 µs', '−6.0'],
          ['块确认 PPDU', '32.0 µs', '38.0 µs', '+6.0'],
          ['合计', '1 856.4 µs', '1 856.4 µs', '0'],
        ] },
      ],
      expect: '二十个 MSDU 装在一个 PPDU 里，信号扩展只计一次，合计仍然都是 1 856.4 µs。',
      meaning: '§10.3.8 把信号扩展加在 PPDU 之后，而不是每个 MSDU 之后（①），所以净和为零不是帧数凑巧。',
    },
    {
      heading: '楼梯间：EIFS 只在 2.4 GHz 上出现',
      jump: 3,
      more: [0],
      steps: [
        '载入本课场景（楼梯间，两台笔记本都在 2.4 GHz 上），跳到第一条 EIFS 记录，读出它的长度；再跳到第一次未能解出，看接收失败的原因。',
        '切换到「换回 5 GHz」，找 EIFS 记录和接收失败的原因。',
        '对照下表的电平与十个种子的统计。',
      ],
      blocks: [
        { kind: 'table', heading: '两台笔记本之间的电平（前导检测门限 −82 dBm）', head: ['路径', '5 GHz', '2.4 GHz'], rows: [
          ['笔记本 A 到笔记本 B', '−83.58 dBm（低 1.58 dB）', '−77.08 dBm（高 4.92 dB）'],
          ['笔记本到路由器', '−64.14 dBm', '−57.64 dBm'],
        ] },
        { kind: 'table', heading: '同一个房间，十个种子的合计', head: ['指标', '5 GHz', '2.4 GHz'], rows: [
          ['吞吐均值', '3.294 Mb/s', '37.374 Mb/s'],
          ['路由器收到的帧', '549', '6 229'],
          ['碰撞', '946', '410'],
          ['EIFS 记录', '0', '6 229'],
        ] },
      ],
      expect: '2.4 GHz 上每一条 EIFS 都是 342 µs，接收失败的原因全部是信噪比不足；5 GHz 上没有 EIFS，43 次接收失败里 42 次是碰撞，1 次是收到一半时本机开始发送而放弃（txDuringRx）。路由器收到的帧是 5 GHz 的 11.3 倍，碰撞从 946 次降到 410 次。',
      meaning: '6.5 dB 是本仿真器的频段路损偏移（②），它把两台笔记本之间的路径推过了 −82 dBm 的硬门限；越过门限之后，等待 EIFS 是 §10.3.2.3.7 的规定（①）。十一倍来自碰撞减少，而不是空口变快；342 µs 是按 1 Mb/s 的 DSSS 确认帧照式 10-7 算出的（①）。',
    },
    {
      heading: '6.5 dB 值几级调制与编码方式',
      variant: 2,
      more: [1],
      steps: [
        '载入「一台站点 · 2.4 GHz」与「一台站点 · 5 GHz」，读出两边数据帧的 MCS。',
        '对照下表：同一个 5 GHz 到达电平，加上 6.5 dB 之后选中的等级。',
      ],
      blocks: [
        { kind: 'table', heading: 'Wi-Fi 6、20 MHz，同一个 5 GHz 到达电平下两条链路选中的等级', head: ['5 GHz 到达电平', '5 GHz', '2.4 GHz（+6.5 dB）', '差几级'], rows: [
          ['−46.7 dBm（桌上）', 'MCS 11 · 143.4 Mb/s', 'MCS 11 · 143.4 Mb/s', '0'],
          ['−60 dBm', 'MCS 7 · 86 Mb/s', 'MCS 10 · 129 Mb/s', '3'],
          ['−70 dBm', 'MCS 4 · 51.6 Mb/s', 'MCS 7 · 86 Mb/s', '3'],
          ['−75 dBm', 'MCS 2 · 25.8 Mb/s', 'MCS 4 · 51.6 Mb/s', '2'],
          ['−80 dBm', 'MCS 0 · 8.6 Mb/s', 'MCS 3 · 34.4 Mb/s', '3'],
        ] },
        { kind: 'widget', widget: 'mcsLadder', params: { mode: 'he', snrDb: 19 },
          caption: '标记位于 5 GHz 到达电平 −75 dBm 处，信噪比 19.0 dB。把它向右移动 6.5 dB，就是同一台设备在 2.4 GHz 上的位置。' },
      ],
      expect: '桌上两边都是 MCS 11，一级也没有升；电平在 −60 dBm 到 −80 dBm 之间时，2.4 GHz 高出两到三级。',
      meaning: '选级算法与 6.5 dB 都是本仿真器的取法与取值（②），标准两者都不规定；所以「远处值两到三级」是这个模型的结论，不是可以直接用于现场的换算。',
    },
    {
      heading: '40 MHz 上限',
      variant: 6,
      more: [5],
      steps: [
        '载入「Wi-Fi 7 请求 160 MHz · 2.4 GHz」，读出协商到的信道带宽、MCS 与数据 PPDU 的长度。',
        '切换到「Wi-Fi 7 请求 160 MHz · 5 GHz」，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '两端都是 Wi-Fi 7、都请求 160 MHz（吞吐为二十个种子的均值）', head: ['指标', '5 GHz', '2.4 GHz'], rows: [
          ['协商到的信道带宽', '160 MHz', '40 MHz'],
          ['选中的 MCS', '9', '13'],
          ['同一帧的数据 PPDU', '83.0 µs', '110.0 µs'],
          ['一次交换', '161.0 µs', '182.0 µs'],
          ['吞吐均值', '52.485 Mb/s', '48.102 Mb/s'],
        ] },
      ],
      expect: '2.4 GHz 只得到 40 MHz，噪声地板（noise floor）只比 20 MHz 高 3.01 dB，于是用到最高的 MCS 13；5 GHz 的 160 MHz 噪声地板高 9.03 dB，只能用 MCS 9，吞吐却仍高出 8.4 %。',
      meaning: '40 MHz 上限是标准的规定（①），不是本仿真器的取值；噪声地板随带宽升高是本仿真器的噪声模型。四个间隔差额的净和为零，剩下的差距全部来自带宽。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§18.5.4 表 18-5（ERP 特性：aSIFSTime 10 µs、长短时隙、aSignalExtension 6 µs、aRxPHYStartDelay、aCWmin）、§27.4.4 表 27-61（HE 物理层特性，按频段取值）、§9.4.1.4（Short Slot Time 子字段）、§10.3.7 式 10-6 与式 10-7（DIFS、EIFS）、§10.3.2.11（ACK 超时）、§10.3.8 与 §18.5.3.2 式 18-1（信号扩展）、§10.3.2.3.7（EIFS 的启用条件）、§18.4.6 与 §27.3.22.6.3（空闲信道评估）、§18.1.2（ERP 的强制速率）、§4.3.15 与 §4.3.16（VHT、HE 站点的频段与带宽）、§10.6.1（速率切换算法不在标准范围之内）。IEEE Std 802.11be-2024 §4.3.16a（EHT 站点在 2.4 GHz 上的带宽）。',
    '本仿真器的取值与取法：−6.5 dB 的频段路损偏移（engine/simulation.ts 的 LINK_EXTRA_LOSS_DB）、固定的短时隙、−82 dBm 的前导检测硬门限、选级时 3 dB 的余量；由 tests/engine/link-2g.test.ts 校验。',
  ],
  limits: [],
  scenario: () => link2gScenario('pair', '2g'),
  variants: [
    { label: '换回 5 GHz', scenario: () => link2gScenario('pair', '5g') },
    { label: '一台站点 · 5 GHz', scenario: () => link2gScenario('single', '5g') },
    { label: '一台站点 · 2.4 GHz', scenario: () => link2gScenario('single', '2g') },
    { label: '启用聚合 · 5 GHz', scenario: () => link2gScenario('burst', '5g') },
    { label: '启用聚合 · 2.4 GHz', scenario: () => link2gScenario('burst', '2g') },
    { label: 'Wi-Fi 7 请求 160 MHz · 5 GHz', scenario: () => link2gScenario('wide', '5g') },
    { label: 'Wi-Fi 7 请求 160 MHz · 2.4 GHz', scenario: () => link2gScenario('wide', '2g') },
  ],
  jumps: [
    J('第一个 DIFS', (r) => r.type === 'IFS_START' && r.kind === 'DIFS'),
    J('第一帧数据', (r) => r.type === 'TX_START' && r.frame.kind === 'data'),
    J('第一次未能解出', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
    J('第一条 EIFS', (r) => r.type === 'IFS_START' && r.kind === 'EIFS'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '同一台笔记本、同一个房间，从 5 GHz 换到 2.4 GHz，一次「数据帧加确认帧」的交换所需的时间会如何变化？',
      options: [
        '变短，因为 DIFS 与 SIFS 都缩短了 6 微秒',
        '完全相同，因为两个变短的帧间间隔正好被两个变长的 PPDU 抵消',
        '变长，因为每个 PPDU 都多了 6 微秒的信号扩展',
      ],
      answer: 1,
      explain: '34 + 146.4 + 16 + 28 = 224.4，28 + 152.4 + 10 + 34 = 224.4。一次完整交换里间隔的个数等于 PPDU 的个数，每个间隔短 6 微秒、每个 PPDU 长 6 微秒；启用聚合也一样，因为信号扩展加在 PPDU 之后。',
    },
    {
      q: '楼梯间那间房里，2.4 GHz 路由器收到的帧是 5 GHz 的十一倍。原因是什么？',
      options: [
        '2.4 GHz 的空口更快，因为帧间间隔更短',
        '两台笔记本在 5 GHz 上收不到对方，在 2.4 GHz 上能检测到对方的前导码却解不出，于是按标准等待 EIFS，碰撞变成了相互避让',
        '2.4 GHz 的调制与编码方式更高，因为路径损耗小了 6.5 dB',
      ],
      answer: 1,
      explain: '空口时长没有缩短。站点之间那条 −83.58 dBm 的路径加 6.5 dB 之后高于 −82 dBm 的前导检测门限；检测到却解不出，按 §10.3.2.3.7 就要等待 EIFS，于是碰撞从 946 次降到 410 次。',
    },
    {
      q: '下面哪一项是标准的规定，而不是本仿真器的取值？',
      options: [
        '2.4 GHz 的路径损耗比 5 GHz 小 6.5 dB',
        'HE 与 EHT 站点在 2.4 GHz 上最宽只能用 40 MHz',
        '前导检测是 −82 dBm 处的一条硬门限',
      ],
      answer: 1,
      explain: '§4.3.16 与 802.11be-2024 §4.3.16a 规定 2.4 GHz 上只有 20 MHz 与 40 MHz。标准不定义电波传播，6.5 dB 是本仿真器的常数；标准对前导检测规定的是检测概率，硬门限是本仿真器的取法。',
    },
  ],
}
