/**
 * Wi-Fi Tier 3 · M12 · 2.4 GHz 这条链路 · the band change, and the one thing it
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
  title: '2.4 GHz 这条链路——换频段没换掉交换时长，换掉的是谁听得见谁',
  why: '这门课量到现在的每一个数，都是在 5 GHz 上量的。把同一套设备搬到 2.4 GHz，四件事会同时变，而方向并不一致：帧间间隔短了、每一个 PPDU（PHY protocol data unit）末尾多挂 6 微秒、路径损耗（path loss）小 6.5 分贝、信道带宽（channel width）却被封死在 40 兆赫。这一课把四件事一件一件量出来。先把最容易记错的那一半挡住：最后一格里 2.4 GHz 的吞吐是 5 GHz 的十倍，可同一台笔记本摆在路由器旁边的桌上时，两条链路（link）量不出任何差别——那十倍跟「快」没有关系。',
  outcomes: [
    '算出同一次交换在两条链路上的时长，并说明四个时间差为什么净和为零',
    '说出 6.5 分贝的频段路损偏移换来几级调制与编码方式（modulation and coding scheme, MCS），以及它在什么位置换来零级',
    '指出换频段真正改变的那一件事，并在时间轴上找到证明它的那一类记录',
  ],
  needs: ['ifs', 'cca', 'hidden', 'width'],
  terms: [
    { term: 'signal extension', plain: '信号扩展：2.4 GHz 上每个 PPDU 的空口时间末尾多算的 6 微秒静默期，为的是让只会算老格式时长的设备把网络分配向量算对。5 GHz 与 6 GHz 上它是 0' },
    { term: 'ERP', plain: '扩展速率物理层：IEEE Std 802.11-2024 第 18 章给 2.4 GHz 定的那一套物理层。本仿真器 2.4 GHz 的六个时间常数全部取自它的 Table 18-5' },
    { term: 'band path-loss offset', plain: '频段路损偏移：本仿真器给整张链路表统一加的一个常数，2.4 GHz 是 −6.5 分贝、6 GHz 是 +1.2 分贝、5 GHz 是 0。它不随距离或墙体变' },
  ],
  picture: [
    { heading: '这间房是为了跨过一条门限而建的', text: '两间卧室，中间一道 2.5 米宽的砖砌楼梯间，路由器摆在楼梯间正中。两台笔记本各在一间卧室里，相距 8.5 米，中间隔着两道砖墙。本仿真器给这条站点（station, STA）到站点的路算出 −83.58 dBm，而前导检测（preamble detection）门限是 −82 dBm——差 1.58 分贝，刚好在门限之下。两台笔记本到路由器的那两条路都是 −64.14 dBm，一模一样，所以这间房里唯一会被频段挪过门限的，就是它们之间那一条。这是刻意摆的刀锋，不是一条普遍规律。' },
    { heading: '先看换频段没有换掉什么', text: '把一台笔记本放在路由器旁边的桌上，让它一直往外传。一次零退避（backoff）的交换由四段组成：一个分布式帧间间隔（DCF interframe space, DIFS）、一个数据帧（data frame）的 PPDU、一个短帧间间隔（short interframe space, SIFS）、一个确认帧（acknowledgement, ACK）的 PPDU。换到 2.4 GHz 之后，这四段里有两段变短、两段变长，而合起来一微秒不差。短的那两段短得一样多，而且是同一个原因：DIFS 就是一个 SIFS 加两个时隙（slot time），而两条链路的时隙都是 9 微秒，所以 DIFS 的差额恰好等于 SIFS 的差额。' },
    { kind: 'watch', jump: 3, heading: '去看那一条 5 GHz 上永远不会出现的记录', text: '载入这一课的场景——楼梯间那间房，两台笔记本都在 2.4 GHz 上——然后跳到第一条扩展帧间间隔（extended interframe space, EIFS）记录。它的长度是 88 微秒，整轮下来一个例外也没有。再把变体切到「搬回 5 GHz」：同一间房、同样两台笔记本，这一类记录一条都找不到。这一课要解释的就是这一条记录为什么只在一条链路上存在。' },
    { kind: 'steps', heading: '那 6.5 分贝做了什么——一步一步', items: [
      '5 GHz 上，两台笔记本之间是 −83.58 dBm，低于 −82 dBm 的前导检测门限。它们的空闲信道评估（clear channel assessment, CCA）对彼此永远报空闲，于是互为隐藏节点（hidden station）：谁也不知道对方在发。空闲信道评估的另一半是 −62 dBm 的能量检测（energy detection, ED），而这个电平离它更远，所以这一课里它一次也没有说话。',
      '两台都认为信道空着，就都发。结果是在路由器那里撞上——时间轴上路由器的接收失败记录，理由全是碰撞。',
      '搬到 2.4 GHz，同一条路加 6.5 分贝变成 −77.08 dBm，高出门限 4.92 分贝。现在它们锁得上对方的前导码（preamble），可解不开那一帧：这个距离上的信干噪比（signal-to-interference-plus-noise ratio, SINR）离这一级调制与编码方式要的差得远，于是接收失败的理由从碰撞变成了信噪比（signal-to-noise ratio, SNR）不足。',
      '而按 §10.3.7，一次「锁上了却没解开」之后要等的不是 DIFS 而是 EIFS。于是两台笔记本开始互相让路：碰撞掉下去，路由器收到的帧翻了十倍。',
    ] },
    { heading: '所以这一课是三句话', text: '换频段没换掉一次交换要花多久；换掉的是链路预算，远处值两到三级调制与编码方式，而桌上一级都不值；真正换掉的是谁听得见谁。最后还要补一个反方向的砝码：这条链路的信道带宽上限是 40 兆赫，一台 Wi-Fi 7 笔记本在这里要不到它在 5 GHz 上能要到的 160 兆赫，那是整节课里 2.4 GHz 唯一干脆输掉的一格。' },
  ],
  numbers: [
    { kind: 'table', heading: '一次零退避的交换，逐段实测（桌上那台笔记本，两边都跑到 MCS 11）', head: [
      '这一段', '5 GHz', '2.4 GHz', '差',
    ], rows: [
      ['DIFS', '34.0 µs', '28.0 µs', '−6.0'],
      ['数据 PPDU（1 528 字节）', '139.2 µs', '145.2 µs', '+6.0'],
      ['SIFS', '16.0 µs', '10.0 µs', '−6.0'],
      ['确认帧 PPDU（14 字节）', '28.0 µs', '34.0 µs', '+6.0'],
      ['合计', '217.2 µs', '217.2 µs', '0'],
    ] },
    { kind: 'table', heading: '同一笔对照，换成开了聚合的那一格：一个装 20 个 MSDU（MAC service data unit）的聚合，一个块确认（block acknowledgement, BlockAck）', head: [
      '这一段', '5 GHz', '2.4 GHz', '差',
    ], rows: [
      ['DIFS', '34.0 µs', '28.0 µs', '−6.0'],
      ['聚合 PPDU（30 718 字节）', '1 771.2 µs', '1 777.2 µs', '+6.0'],
      ['SIFS', '16.0 µs', '10.0 µs', '−6.0'],
      ['块确认 PPDU', '32.0 µs', '38.0 µs', '+6.0'],
      ['合计', '1 853.2 µs', '1 853.2 µs', '0'],
    ] },
    { kind: 'formula', heading: '两行都是零，而第二行说明了第一行不是巧合', text: '一次完整的交换里，IFS 的个数恒等于 PPDU 的个数：一个 DIFS 带头，之后每多一个 PPDU 就多一个 SIFS。每个 IFS 短 6 µs，每个 PPDU 长 6 µs。', note: '所以信号扩展是按 PPDU 收的，不是按 MSDU 收的：20 个 MSDU 装进一个聚合 MPDU（aggregate MPDU, A-MPDU），只付一次 6 微秒。真正不为零的那一格是失败的交换——数据帧发出去没人确认时，5 GHz 等 45 微秒而 2.4 GHz 等 39 微秒，整段从 1 551.0 µs 降到 1 545.0 µs，2.4 GHz 反而快 6 微秒。' },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'he', snrDb: 18.8 },
      caption: '标记停在远处那台笔记本的信噪比上。把它往右推 6.5 分贝，就是同一台笔记本在 2.4 GHz 上的位置——点亮的级会往上走两到三格。' },
    { kind: 'table', heading: '6.5 分贝换来几级（Wi-Fi 6、20 兆赫，同一个 5 GHz 到达电平下两条链路的对照）', head: [
      '5 GHz 到达电平', '5 GHz', '2.4 GHz（+6.5 分贝）', '差几级',
    ], rows: [
      ['−46.7 dBm（桌上）', 'MCS 11 · 143.4 Mb/s', 'MCS 11 · 143.4 Mb/s', '0'],
      ['−60 dBm', 'MCS 7 · 86 Mb/s', 'MCS 10 · 129 Mb/s', '3'],
      ['−70 dBm', 'MCS 4 · 51.6 Mb/s', 'MCS 7 · 86 Mb/s', '3'],
      ['−75 dBm', 'MCS 2 · 25.8 Mb/s', 'MCS 4 · 51.6 Mb/s', '2'],
      ['−80 dBm', 'MCS 0 · 8.6 Mb/s', 'MCS 3 · 34.4 Mb/s', '3'],
    ] },
    { heading: '楼梯间那间房，十个种子', text: '5 GHz 上两台笔记本互为隐藏节点，吞吐均值 3.732 Mb/s，路由器收下 622 帧，碰撞 948 次，EIFS 记录 0 条。搬到 2.4 GHz：均值 39.096 Mb/s，收下 6 516 帧，碰撞降到 397 次，EIFS 记录 6 516 条、长度全是 88 微秒。收下的帧数差 10.5 倍。要留意这十倍买自哪里——不是更快的空口，是少掉的碰撞；上面第一张表已经证明空口一微秒都没快。' },
    { kind: 'table', heading: '反方向的砝码：40 兆赫上限（两端都是 Wi-Fi 7、都要 160 兆赫，二十个种子）', head: [
      '读哪一项', '5 GHz', '2.4 GHz',
    ], rows: [
      ['协商到的信道带宽', '160 兆赫', '40 兆赫（封顶）'],
      ['选中的 MCS', '9', '13'],
      ['同一帧的数据 PPDU', '61.6 µs', '94.8 µs'],
      ['一次交换', '139.6 µs', '166.8 µs'],
      ['吞吐均值', '57.909 Mb/s', '51.258 Mb/s'],
    ] },
    { heading: '那一格里两件相反的事同时发生', text: '5 GHz 开到 160 兆赫，噪声地板（noise floor）跟着抬高 9.03 分贝，把它压到 MCS 9；2.4 GHz 守在 40 兆赫上只抬 3.01 分贝，于是它一路爬到阶梯顶上的 MCS 13。可它还是输 11.5 个百分点——因为 160 兆赫的车道数赢回来的，比阶梯上那四级多。四个帧间间隔的差额净和为零，剩下的差就全是带宽的了。' },
  ],
  deeper: [
    { heading: '一台 Wi-Fi 5 笔记本配得上这条链路，却上不去', text: '编辑器里那个频段下拉框只在站点不是 Wi-Fi 5、也没开多链路操作时才出现。这不是界面少做了一步：`caps.ts` 的 `nodeLinks` 要求节点写着 2.4 GHz 且世代不是 vht 才把它放到这条链路上，因为 802.11ac 只定义在 5 GHz 上。于是一台 Wi-Fi 5 站点即使在场景文件里写着 2.4 GHz，仍然跑在 5 GHz 上——一个合法、存得下、却什么也不改变的配置，而界面干脆不把它交给人去选。' },
    { heading: '为什么这一课的场景都关着 EDCA', text: '开了增强型分布式信道接入之后，时间轴上的帧间间隔记录就不再是 DIFS 而是 AIFS，连带 AIFSN 一起按接入类别取值，这一课要对照的那个 28 对 34 就从记录里消失了。2.4 GHz 的 AIFS 数字不必在这里重算：《与 Wi-Fi 共存》已经把 AC_BE 的 37 微秒与 AC_BK 的 73 微秒印在它自己的主路径上了。' },
  ],
  limits: [
    { kind: 'model-value', text: '−6.5 分贝是本仿真器选的一个常数，整张链路表统一加减，不随距离与墙体材质变化（`simulation.ts` 的 LINK_EXTRA_LOSS_DB）。真实世界里 2.4 GHz 与 5 GHz 在自由空间中的路径损耗差约为 6.6 分贝，而一旦有砖墙、金属或家具参与，两个频段的衰减比例并不一样——所以这一课里「远处值两到三级调制与编码方式」是这个模型的结论，不是一条可以搬到现场去的换算。' },
    { kind: 'threshold', text: '这一课在一台 Wi-Fi 6 站点上印出 2.4 GHz 的确认帧超时 39 微秒，而按标准它应当是 43 微秒。本仿真器对所有世代都取 aRxPHYStartDelay = 20 微秒，那是第 17/18 章的值；Table 19-25 与 Table 27-61 给 HT 与 HE 的是 24 微秒，于是 10 + 9 + 24 = 43。差额来自引擎统一取了一个值，不是来自算错：换上一台只会老格式的站点，39 微秒就是标准值。这个差没有被藏起来，也没有为了躲开它去换掉场景里那台读者熟悉的设备。短帧间间隔与时隙（slot time）两项在两个算法里都是 10 与 9 微秒，差的只有第三项。' },
    { kind: 'threshold', text: '前导检测在本仿真器里是 −82 dBm 一条硬线：高过它一定锁上，低过它一定不存在。真实接收机是一条概率曲线，门限附近是一段锁得上与锁不上各占几分的灰区，而不是一道台阶。所以这一课那十倍是一次刀锋演示——这间房的几何刻意把站点之间那条路放在门限之下 1.58 分贝处。换一套几何，比如让它低于门限 10 分贝，6.5 分贝就跨不过去，这一格什么也不会发生。而这一格之所以成立，靠的正是这条硬线两侧的那 6.5 分贝。' },
    { kind: 'out-of-scope', text: '这条链路上真正的老设备不在建模范围内：ERP-DSSS/CCK 的 1、2、5.5、11 Mb/s 四档速率，以及老设备在场时整个网络要开的那套保护机制（CTS-to-self、长前导码、长时隙），引擎一概没有。本仿真器的 2.4 GHz 只建了第 18 章里较新的那一支，并且固定用 9 微秒的短时隙——这恰好是 2.4 GHz 在现实里最出名的那个麻烦，而这一课碰不到它。' },
  ],
  sources: [
    '2.4 GHz 的六个时间常数出自 IEEE Std 802.11-2024 的 Table 18-5「ERP characteristics」（§18.5.4）：aSIFSTime 10 µs、短时隙 9 µs、aSignalExtension 6 µs、aRxPHYStartDelay（ERP-OFDM）20 µs、aCWmin 15（短时隙那一支）。三个导出量的条号在 §10.3.7（DIFS 与 EIFS）与 §10.3.2.11（确认帧超时）。',
    '信号扩展在标准里挂在 PPDU 格式上而不是频段上：§10.3.8 列出适用的格式（ERP-OFDM、NON_HT_DUP_OFDM、HT_MF、HT_GF、HE_SU、HE_MU、HE_ER_SU、HE_TB）。它读起来像频段性质，是因为 Table 19-25 与 Table 27-61 把 aSignalExtension 本身定义成按频段取值：5/6 GHz 为 0，2.4 GHz 为 6 µs。',
    '前导检测 −82 dBm 与能量检测 −62 dBm 出自 §17.3.10.6，引擎 `phy.ts` 在 CCA_PD_DBM 旁边注的是同一条。aRxPHYStartDelay 对 HT 与 HE 的 24 µs 分别在 Table 19-25（§19.4.4）与 Table 27-61。',
    '−6.5 分贝的频段路损偏移与 40 兆赫的带宽上限都不在 IEEE 语料里，它们是本仿真器的模型取值：前者在 `engine/simulation.ts` 的 LINK_EXTRA_LOSS_DB，后者在 `model/caps.ts` 的 widthOf。两者都由 `tests/engine/link-2g.test.ts` 钉住。',
  ],
  scenario: () => link2gScenario('pair', '2g'),
  variants: [
    { label: '搬回 5 GHz', scenario: () => link2gScenario('pair', '5g') },
    { label: '一台站点 · 5 GHz', scenario: () => link2gScenario('single', '5g') },
    { label: '一台站点 · 2.4 GHz', scenario: () => link2gScenario('single', '2g') },
    { label: '开聚合 · 5 GHz', scenario: () => link2gScenario('burst', '5g') },
    { label: '开聚合 · 2.4 GHz', scenario: () => link2gScenario('burst', '2g') },
    { label: 'Wi-Fi 7 要 160 MHz · 5 GHz', scenario: () => link2gScenario('wide', '5g') },
    { label: 'Wi-Fi 7 要 160 MHz · 2.4 GHz', scenario: () => link2gScenario('wide', '2g') },
  ],
  jumps: [
    J('第一个 DIFS', (r) => r.type === 'IFS_START' && r.kind === 'DIFS'),
    J('第一帧数据', (r) => r.type === 'TX_START' && r.frame.kind === 'data'),
    J('第一次解不开', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
    J('第一条 EIFS', (r) => r.type === 'IFS_START' && r.kind === 'EIFS'),
  ],
  observe: [
    '在这一课自己的场景里，每一条 EIFS 记录的长度都是 88 微秒，一个例外也没有；接收失败的理由全是信噪比不足，没有一条是碰撞。切到「搬回 5 GHz」，这两句话同时反过来：EIFS 一条也没有，失败的理由全是碰撞。',
    '在「一台站点」那两个变体之间来回切，只读四个确定的数：DIFS 从 34.0 变成 28.0 微秒，数据 PPDU 从 139.2 变成 145.2，SIFS 从 16.0 变成 10.0，确认帧从 28.0 变成 34.0。而两边的一次交换都是 217.2 微秒。',
    '在「Wi-Fi 7 要 160 MHz」那两个变体里读协商到的信道带宽：160 兆赫对 40 兆赫。同一个 1 528 字节的帧，空口时间（airtime）从 61.6 微秒涨到 94.8 微秒——这一个数就比整条链路四个帧间间隔的差额加起来还大五倍。',
  ],
  tryThis: [
    '把楼梯间的宽度从 2.5 米拉到 4 米再载入 2.4 GHz 那一边：站点之间掉到 −85.70 dBm，加上 6.5 分贝是 −79.20，仍然高过门限，所以这一格还在。继续拉宽直到它跌破 −88.5 dBm，EIFS 就会一条不剩，两台笔记本会退回 5 GHz 上那个互撞的样子。这一课的十倍是靠一条门限立住的，不是靠频段。',
    '在「一台站点」那两个变体上分别换几个随机种子，把吞吐记下来：两条链路的均值都落在 42.1 Mb/s 附近，差不到一个标准差。注意不要只跑一个种子就下结论——翻频段会同时翻掉退避的随机序列（站点在 2.4 GHz 上的内部编号带了后缀，而随机流是按这个编号分叉的），所以单次的高低是抽签的结果，不是频段的结果。',
  ],
  quiz: [
    {
      q: '同一台笔记本、同一个房间，从 5 GHz 搬到 2.4 GHz，一次「数据帧加确认帧」的交换要花的时间会怎样变？',
      options: [
        '变短，因为 DIFS 与 SIFS 都短了 6 微秒',
        '一微秒不差，因为两个变短的帧间间隔正好被两个变长的 PPDU 抵掉',
        '变长，因为每个 PPDU 都多了 6 微秒的信号扩展',
      ],
      answer: 1,
      explain: '34 + 139.2 + 16 + 28 = 217.2，28 + 145.2 + 10 + 34 = 217.2。一次完整交换里 IFS 的个数恒等于 PPDU 的个数，每个 IFS 短 6 微秒、每个 PPDU 长 6 微秒，所以净和为零——开了聚合也一样，因为信号扩展是按 PPDU 收的。',
    },
    {
      q: '楼梯间那间房里，2.4 GHz 的吞吐是 5 GHz 的十倍。原因是什么？',
      options: [
        '2.4 GHz 的空口更快，因为帧间间隔更短',
        '两台笔记本在 5 GHz 上听不见对方而在 2.4 GHz 上听得见，于是碰撞变成了互相让路',
        '2.4 GHz 的调制与编码方式更高，因为路径损耗小了 6.5 分贝',
      ],
      answer: 1,
      explain: '空口一微秒也没快（第一张表）。调制与编码方式确实升了两级，可两台笔记本到路由器的那条路本来就够用。真正变的是站点之间那条 −83.58 dBm 的路加 6.5 分贝之后高过了 −82 dBm 的前导检测门限：它们开始锁得上对方却解不开，解不开要等 EIFS，于是碰撞从 948 降到 397。',
    },
  ],
}
