/**
 * Wi-Fi Tier 3 · M12 · 2.4 GHz 链路 · the band change, and the one thing it
 * actually changes.
 *
 * The first lesson of the course's third tier, and the first to put a Wi-Fi
 * station on the 2.4 GHz link. The engine has had that link since the per-link
 * PHY slice — `ERP_2G` (clause 18 Table 18-5), `LINK_EXTRA_LOSS_DB['2g']`
 * = −6.5, `widthOf`'s 40 MHz cap and `nodeLinks`' `'2g'` branch, all pinned by
 * `tests/engine/link-2g.test.ts` — and until this lesson the only scenes that
 * reached it were the five AMP lessons' tag scenes, where the thing on the air
 * is a tag and not a station. This slice adds no engine code.
 *
 * **The lesson's spine is not the three interframe figures the backlog named.**
 * DIFS 28 against 34, SIFS 10 against 16, and the 6 µs signal extension charged
 * to every PPDU sum to exactly zero over one exchange, and the zero is
 * structural rather than lucky: a complete exchange holds one IFS per PPDU, each
 * IFS is 6 µs shorter on this band and each PPDU 6 µs longer. Measured on two
 * shapes — one frame with one acknowledgement (217.2 µs either way) and a
 * twenty-MSDU A-MPDU with one BlockAck (1 853.2 µs either way) — in
 * `tests/course/link-2g.test.ts`. A lesson built on those three numbers would be
 * a lesson whose subject provably does nothing.
 *
 * So the spine is: the band does not change the exchange; it changes the link
 * budget (two or three MCS rungs at range, none on the desk); and what it really
 * changes is who can hear whom — the 6.5 dB carries the station-to-station ray
 * across `CCA_PD_DBM`, and two hidden stations become two stations that defer to
 * each other through EIFS. The 40 MHz cap is carried with it as the
 * counterweight, because without it the lesson reads as an advertisement.
 *
 * Every figure below is pinned in tests/course/link-2g.test.ts: the deterministic
 * ones (durations, intervals, MCS rungs, negotiated widths, record kinds) exactly,
 * and the throughput means across ten to thirty seeds. Single-seed throughput is
 * NOT a legal measurement on this lesson's subject, and the test says why: a
 * station's MAC random stream is forked on `hashStr(virtualId(id, link))`, and
 * `virtualId` suffixes every link but 5 GHz, so flipping the band also flips the
 * backoff sequence.
 */
import { type Lesson, J } from '../lessonKit'
import { link2gScenario } from '../wifiScenes'

export const link2g: Lesson = {
  id: 'link-2g',
  module: 12,
  title: '2.4 GHz 链路——换频段不改变交换时长，改变的是站点能否相互收到',
  why: '这门课到目前为止测得的每一个数，都是在 5 GHz 上测得的。把同一套设备移到 2.4 GHz，四项参数会同时改变，而方向并不一致：帧间间隔变短、每一个 PPDU（PHY protocol data unit）末尾多出 6 微秒、路径损耗（path loss）减小 6.5 分贝、信道带宽（channel width）却被限制在 40 兆赫。前两项相互抵消：一次交换里帧间间隔的个数恒等于 PPDU 的个数，每个间隔缩短的时间正好等于每个 PPDU 增加的时间，所以同一次交换在两条链路（link）上的时长完全相同。减少的路损在远处相当于两到三级调制与编码方式（modulation and coding scheme, MCS），在路由器旁边的桌上则一级也换不来，两条链路测不出任何差别。真正改变的是站点（station, STA）之间能否相互收到：楼梯间两侧的两台笔记本在 5 GHz 上收不到对方的前导码（preamble），都认为信道空闲，于是在路由器处一次次发生碰撞；到了 2.4 GHz，对方的前导码恰好能够锁定，帧虽然解不出，之后却要改为等待更长的扩展帧间间隔（extended interframe space, EIFS），两台笔记本于是开始相互避让，路由器收到的帧增加到十倍——这十倍来自碰撞的减少，而不是更快的空口。这个房间是有意布置在前导检测（preamble detection）门限附近的，并不代表普遍规律。方向相反的是带宽：两端都请求更宽信道的 Wi-Fi 7 笔记本在 2.4 GHz 上得不到这样的信道，噪声地板（noise floor）更低、选中的调制与编码方式高出四级，吞吐仍然低一成多。',
  outcomes: [
    '算出同一次交换在两条链路上的时长，并说明四个时间差为什么净和为零',
    '说出 6.5 分贝的频段路损偏移相当于几级调制与编码方式（modulation and coding scheme, MCS），以及在什么位置它一级也换不来',
    '指出换频段真正改变的那一件事，并在时间轴上找到证明它的那一类记录',
  ],
  needs: ['ifs', 'cca', 'hidden', 'width'],
  terms: [
    { term: 'signal extension', plain: '信号扩展：2.4 GHz 上每个 PPDU 的空口时间末尾多算的 6 微秒静默期，目的是让只能按旧格式计算时长的设备正确设置网络分配向量。5 GHz 与 6 GHz 上它是 0' },
    { term: 'ERP', plain: '扩展速率物理层：IEEE Std 802.11-2024 第 18 章为 2.4 GHz 定义的那一套物理层。本仿真器 2.4 GHz 的六个时间常数全部取自它的 Table 18-5' },
    { term: 'band path-loss offset', plain: '频段路损偏移：本仿真器给整张链路表统一加的一个常数，2.4 GHz 是 −6.5 分贝、6 GHz 是 +1.2 分贝、5 GHz 是 0。它不随距离或墙体变化' },
  ],
  picture: [
    { heading: '这个房间是为越过一条门限而设计的', text: '两间卧室，中间一道 2.5 米宽的砖砌楼梯间，路由器放在楼梯间正中。两台笔记本各在一间卧室里，相距 8.5 米，中间隔着两道砖墙。本仿真器为这条站点（station, STA）到站点的路径算出 −83.58 dBm，而前导检测（preamble detection）门限是 −82 dBm——相差 1.58 分贝，恰好低于门限。两台笔记本到路由器的那两条路径都是 −64.14 dBm，完全相同，所以这个房间里唯一会因频段改变而越过门限的，就是它们之间那一条。这是有意设置在临界点上的场景，并不代表普遍规律。' },
    { heading: '先看换频段没有改变什么', text: '把一台笔记本放在路由器旁边的桌上，让它持续向外发送。一次零退避（backoff）的交换由四段组成：一个分布式帧间间隔（DCF interframe space, DIFS）、一个数据帧（data frame）的 PPDU、一个短帧间间隔（short interframe space, SIFS）、一个确认帧（acknowledgement, ACK）的 PPDU。换到 2.4 GHz 之后，这四段里有两段变短、两段变长，而总和完全相同。变短的两段缩短的量相同，而且原因相同：DIFS 就是一个 SIFS 加两个时隙（slot time），而两条链路的时隙都是 9 微秒，所以 DIFS 的差额恰好等于 SIFS 的差额。' },
    { kind: 'watch', jump: 3, heading: '查看那一类在 5 GHz 上永远不会出现的记录', text: '载入这一课的场景——楼梯间那间房，两台笔记本都在 2.4 GHz 上——然后跳到第一条扩展帧间间隔（extended interframe space, EIFS）记录。它的长度是 88 微秒，整轮下来一个例外也没有。再把变体切换到「换回 5 GHz」：同一个房间、同样两台笔记本，这一类记录一条也没有。这一课要解释的就是这一条记录为什么只在一条链路上存在。' },
    { kind: 'steps', heading: '那 6.5 分贝起了什么作用——逐步说明', items: [
      '5 GHz 上，两台笔记本之间是 −83.58 dBm，低于 −82 dBm 的前导检测门限。它们的空闲信道评估（clear channel assessment, CCA）对彼此的发送始终报告空闲，于是互为隐藏节点（hidden station）：都不知道对方正在发送。空闲信道评估的另一半是 −62 dBm 的能量检测（energy detection, ED），而这个电平离它更远，所以这一课里它从未被触发。',
      '两台都认为信道空闲，于是都发送。结果是在路由器处发生碰撞——时间轴上路由器的接收失败记录，原因全部是碰撞。',
      '换到 2.4 GHz，同一条路径加 6.5 分贝变为 −77.08 dBm，高出门限 4.92 分贝。现在它们能锁定对方的前导码（preamble），却解不出那一帧：这个距离上的信干噪比（signal-to-interference-plus-noise ratio, SINR）远低于这一级调制与编码方式的要求，于是接收失败的原因从碰撞变成了信噪比（signal-to-noise ratio, SNR）不足。',
      '而按 §10.3.7，一次「锁定了却没有解出」之后要等待的不是 DIFS 而是 EIFS。于是两台笔记本开始相互避让：碰撞减少，路由器收到的帧增加到十倍。',
    ] },
    { heading: '这一课的结论可以归纳为三句话', text: '换频段不改变一次交换的时长；改变的是链路预算，在远处相当于两到三级调制与编码方式，在桌上则一级也换不来；真正改变的是站点之间能否相互收到。最后还要补充一个反方向的因素：这条链路的信道带宽上限是 40 兆赫，一台 Wi-Fi 7 笔记本在这里得不到它在 5 GHz 上能得到的 160 兆赫，这是整节课里 2.4 GHz 唯一明显落后的一项。' },
  ],
  numbers: [
    { kind: 'table', heading: '一次零退避的交换，逐段实测（桌上那台笔记本，两边都达到 MCS 11）', head: [
      '这一段', '5 GHz', '2.4 GHz', '差',
    ], rows: [
      ['DIFS', '34.0 µs', '28.0 µs', '−6.0'],
      ['数据 PPDU（1 528 字节）', '139.2 µs', '145.2 µs', '+6.0'],
      ['SIFS', '16.0 µs', '10.0 µs', '−6.0'],
      ['确认帧 PPDU（14 字节）', '28.0 µs', '34.0 µs', '+6.0'],
      ['合计', '217.2 µs', '217.2 µs', '0'],
    ] },
    { kind: 'table', heading: '同样的对照，换成启用聚合的情形：一个包含 20 个 MSDU（MAC service data unit）的聚合，一个块确认（block acknowledgement, BlockAck）', head: [
      '这一段', '5 GHz', '2.4 GHz', '差',
    ], rows: [
      ['DIFS', '34.0 µs', '28.0 µs', '−6.0'],
      ['聚合 PPDU（30 718 字节）', '1 771.2 µs', '1 777.2 µs', '+6.0'],
      ['SIFS', '16.0 µs', '10.0 µs', '−6.0'],
      ['块确认 PPDU', '32.0 µs', '38.0 µs', '+6.0'],
      ['合计', '1 853.2 µs', '1 853.2 µs', '0'],
    ] },
    { kind: 'formula', heading: '两行都是零，而第二行说明了第一行不是巧合', text: '一次完整的交换里，IFS 的个数恒等于 PPDU 的个数：一个 DIFS 带头，之后每多一个 PPDU 就多一个 SIFS。每个 IFS 短 6 µs，每个 PPDU 长 6 µs。', note: '所以信号扩展按 PPDU 计，而不是按 MSDU 计：20 个 MSDU 装入一个聚合 MPDU（aggregate MPDU, A-MPDU），只计一次 6 微秒。差值真正不为零的是失败的交换——数据帧发出后没有收到确认时，5 GHz 等待 45 微秒而 2.4 GHz 等待 39 微秒，整段从 1 551.0 µs 降到 1 545.0 µs，2.4 GHz 反而快 6 微秒。' },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'he', snrDb: 18.8 },
      caption: '标记位于远处那台笔记本的信噪比处。把它向右移动 6.5 分贝，就是同一台笔记本在 2.4 GHz 上的位置——点亮的等级会上升两到三级。' },
    { kind: 'table', heading: '6.5 分贝相当于几级（Wi-Fi 6、20 兆赫，同一个 5 GHz 到达电平下两条链路的对照）', head: [
      '5 GHz 到达电平', '5 GHz', '2.4 GHz（+6.5 分贝）', '差几级',
    ], rows: [
      ['−46.7 dBm（桌上）', 'MCS 11 · 143.4 Mb/s', 'MCS 11 · 143.4 Mb/s', '0'],
      ['−60 dBm', 'MCS 7 · 86 Mb/s', 'MCS 10 · 129 Mb/s', '3'],
      ['−70 dBm', 'MCS 4 · 51.6 Mb/s', 'MCS 7 · 86 Mb/s', '3'],
      ['−75 dBm', 'MCS 2 · 25.8 Mb/s', 'MCS 4 · 51.6 Mb/s', '2'],
      ['−80 dBm', 'MCS 0 · 8.6 Mb/s', 'MCS 3 · 34.4 Mb/s', '3'],
    ] },
    { heading: '楼梯间那间房，十个种子', text: '5 GHz 上两台笔记本互为隐藏节点，吞吐均值 3.732 Mb/s，路由器收到 622 帧，碰撞 948 次，EIFS 记录 0 条。换到 2.4 GHz：均值 39.096 Mb/s，收到 6 516 帧，碰撞降到 397 次，EIFS 记录 6 516 条、长度全是 88 微秒。收到的帧数是 5 GHz 的 10.5 倍。要注意这十倍从何而来——不是更快的空口，而是碰撞的减少；上面第一张表已经证明空口时长没有缩短。' },
    { kind: 'table', heading: '反方向的因素：40 兆赫上限（两端都是 Wi-Fi 7、都请求 160 兆赫，二十个种子）', head: [
      '指标', '5 GHz', '2.4 GHz',
    ], rows: [
      ['协商到的信道带宽', '160 兆赫', '40 兆赫（受限）'],
      ['选中的 MCS', '9', '13'],
      ['同一帧的数据 PPDU', '61.6 µs', '94.8 µs'],
      ['一次交换', '139.6 µs', '166.8 µs'],
      ['吞吐均值', '57.909 Mb/s', '51.258 Mb/s'],
    ] },
    { heading: '这一项中两种相反的效应同时存在', text: '5 GHz 使用 160 兆赫，噪声地板（noise floor）随之升高 9.03 分贝，使它只能使用 MCS 9；2.4 GHz 停留在 40 兆赫，噪声地板只升高 3.01 分贝，于是它一直升到最高的 MCS 13。但它的吞吐仍然低 11.5 %——因为 160 兆赫的带宽带来的增益，超过了高出的那四级调制与编码方式。四个时间差的净和为零，剩下的差距就全部来自带宽。' },
  ],
  deeper: [
    { heading: '一台 Wi-Fi 5 笔记本无法使用这条链路', text: '编辑器里那个频段下拉框只在站点不是 Wi-Fi 5、也没有启用多链路操作时才出现。这不是界面遗漏了一步：`caps.ts` 的 `nodeLinks` 要求节点写着 2.4 GHz 且世代不是 vht 才把它放到这条链路上，因为 802.11ac 只定义在 5 GHz 上。于是一台 Wi-Fi 5 站点即使在场景文件里写着 2.4 GHz，仍然工作在 5 GHz 上——这是一个合法、可以保存、却不改变任何结果的配置，因此界面直接不提供这个选项。' },
    { heading: '为什么这一课的场景都关闭了 EDCA', text: '启用增强型分布式信道接入之后，时间轴上的帧间间隔记录就不再是 DIFS 而是 AIFS，并与 AIFSN 一起按接入类别取值，这一课要对照的那个 28 对 34 就从记录里消失了。2.4 GHz 的 AIFS 数值不必在这里重新计算：《AMP 与 Wi-Fi 共享 2.4 GHz》已经在它自己的主路径上给出了 AC_BE 的 37 微秒与 AC_BK 的 73 微秒。' },
  ],
  limits: [
    { kind: 'model-value', text: '−6.5 分贝是本仿真器选定的一个常数，整张链路表统一加减，不随距离与墙体材质变化（`simulation.ts` 的 LINK_EXTRA_LOSS_DB）。真实世界里 2.4 GHz 与 5 GHz 在自由空间中的路径损耗差约为 6.6 分贝，而一旦有砖墙、金属或家具参与，两个频段的衰减比例并不一样——所以这一课里「远处值两到三级调制与编码方式」是这个模型的结论，而不是一条可以直接用于现场的换算关系。' },
    { kind: 'threshold', text: '这一课在一台 Wi-Fi 6 站点上显示 2.4 GHz 的确认帧超时为 39 微秒，而按标准它应当是 43 微秒。本仿真器对所有世代都取 aRxPHYStartDelay = 20 微秒，那是第 17/18 章的值；Table 19-25 与 Table 27-61 给 HT 与 HE 的是 24 微秒，于是 10 + 9 + 24 = 43。差额来自引擎统一取值，而不是计算错误：换成一台只支持旧格式的站点，39 微秒就是标准值。这个差异没有被隐藏，也没有为了回避它而更换场景里那台读者熟悉的设备。短帧间间隔与时隙（slot time）两项在两个算法里都是 10 与 9 微秒，差的只有第三项。' },
    { kind: 'threshold', text: '前导检测在本仿真器里是 −82 dBm 的硬门限：高于它一定能锁定，低于它则完全检测不到。真实接收机是一条概率曲线，门限附近是一段能否锁定各有一定概率的过渡区，而不是阶跃。所以这一课的十倍是一个处于临界点的演示——这个房间的几何布置有意把站点之间那条路径放在门限之下 1.58 分贝处。换一种几何布置，比如让它低于门限 10 分贝，6.5 分贝就无法越过门限，这一效应也就不会出现。而这一效应之所以成立，依靠的正是这条硬门限两侧的那 6.5 分贝。' },
    { kind: 'out-of-scope', text: '这条链路上真正的老设备不在建模范围内：ERP-DSSS/CCK 的 1、2、5.5、11 Mb/s 四档速率，以及老设备在场时整个网络要开的那套保护机制（CTS-to-self、长前导码、长时隙），引擎均未实现。本仿真器的 2.4 GHz 只建模了第 18 章中较新的那一部分，并且固定使用 9 微秒的短时隙——而这恰好是 2.4 GHz 在现实中最著名的问题，这一课无法涉及。' },
  ],
  sources: [
    '2.4 GHz 的六个时间常数出自 IEEE Std 802.11-2024 的 Table 18-5「ERP characteristics」（§18.5.4）：aSIFSTime 10 µs、短时隙 9 µs、aSignalExtension 6 µs、aRxPHYStartDelay（ERP-OFDM）20 µs、aCWmin 15（短时隙那一支）。三个导出量的条号在 §10.3.7（DIFS 与 EIFS）与 §10.3.2.11（确认帧超时）。',
    '信号扩展在标准里挂在 PPDU 格式上而不是频段上：§10.3.8 列出适用的格式（ERP-OFDM、NON_HT_DUP_OFDM、HT_MF、HT_GF、HE_SU、HE_MU、HE_ER_SU、HE_TB）。它看起来像频段的性质，是因为 Table 19-25 与 Table 27-61 把 aSignalExtension 本身定义成按频段取值：5/6 GHz 为 0，2.4 GHz 为 6 µs。',
    '前导检测 −82 dBm 与能量检测 −62 dBm 出自 §17.3.10.6，引擎 `phy.ts` 在 CCA_PD_DBM 旁边注的是同一条。aRxPHYStartDelay 对 HT 与 HE 的 24 µs 分别在 Table 19-25（§19.4.4）与 Table 27-61。',
    '−6.5 分贝的频段路损偏移与 40 兆赫的带宽上限都不在 IEEE 语料里，它们是本仿真器的模型取值：前者在 `engine/simulation.ts` 的 LINK_EXTRA_LOSS_DB，后者在 `model/caps.ts` 的 widthOf。两者都由 `tests/engine/link-2g.test.ts` 校验。',
  ],
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
  observe: [
    '在这一课自己的场景里，每一条 EIFS 记录的长度都是 88 微秒，一个例外也没有；接收失败的原因全部是信噪比不足，没有一条是碰撞。切换到「换回 5 GHz」，这两点同时反转：EIFS 一条也没有，失败的原因全部是碰撞。',
    '在「一台站点」那两个变体之间来回切换，只读取四个确定的数：DIFS 从 34.0 变成 28.0 微秒，数据 PPDU 从 139.2 变成 145.2，SIFS 从 16.0 变成 10.0，确认帧从 28.0 变成 34.0。而两边的一次交换都是 217.2 微秒。',
    '在「Wi-Fi 7 请求 160 MHz」那两个变体里读取协商到的信道带宽：160 兆赫对 40 兆赫。同一个 1 528 字节的帧，空口时间（airtime）从 61.6 微秒增加到 94.8 微秒——仅这一项就多出 33.2 微秒，是上一条里每一项 6 微秒差额的五倍多，而那四项差额相加正好为零。',
  ],
  tryThis: [
    '把楼梯间的宽度从 2.5 米增加到 4 米，再载入 2.4 GHz 那一边：站点之间降到 −85.70 dBm，加上 6.5 分贝是 −79.20，仍然高于门限，所以这一效应仍然存在。继续加宽，直到它低于 −88.5 dBm，EIFS 记录就会全部消失，两台笔记本会回到 5 GHz 上那种相互碰撞的状态。这一课的十倍取决于一条门限，而不是频段。',
    '在「一台站点」那两个变体上分别更换几个随机种子，记录吞吐：两条链路的均值都在 42.1 Mb/s 附近，相差不到一个标准差。注意不要只运行一个种子就下结论——切换频段会同时改变退避的随机序列（站点在 2.4 GHz 上的内部编号带了后缀，而随机流是按这个编号分叉的），所以单次结果的高低是随机抽取的结果，而不是频段的结果。',
  ],
  quiz: [
    {
      q: '同一台笔记本、同一个房间，从 5 GHz 换到 2.4 GHz，一次「数据帧加确认帧」的交换所需的时间会如何变化？',
      options: [
        '变短，因为 DIFS 与 SIFS 都缩短了 6 微秒',
        '完全相同，因为两个变短的帧间间隔正好被两个变长的 PPDU 抵消',
        '变长，因为每个 PPDU 都多了 6 微秒的信号扩展',
      ],
      answer: 1,
      explain: '34 + 139.2 + 16 + 28 = 217.2，28 + 145.2 + 10 + 34 = 217.2。一次完整交换里 IFS 的个数恒等于 PPDU 的个数，每个 IFS 短 6 微秒、每个 PPDU 长 6 微秒，所以净和为零——启用聚合也一样，因为信号扩展是按 PPDU 计的。',
    },
    {
      q: '楼梯间那间房里，2.4 GHz 的吞吐是 5 GHz 的十倍。原因是什么？',
      options: [
        '2.4 GHz 的空口更快，因为帧间间隔更短',
        '两台笔记本在 5 GHz 上收不到对方而在 2.4 GHz 上能收到，于是碰撞变成了相互避让',
        '2.4 GHz 的调制与编码方式更高，因为路径损耗小了 6.5 分贝',
      ],
      answer: 1,
      explain: '空口时长没有缩短（第一张表）。调制与编码方式确实升高了两级，但两台笔记本到路由器的那条路径本来就足够。真正改变的是站点之间那条 −83.58 dBm 的路径加 6.5 分贝之后高于 −82 dBm 的前导检测门限：它们开始能锁定对方的前导码却解不出帧，解不出就要等待 EIFS，于是碰撞从 948 降到 397。',
    },
  ],
}
