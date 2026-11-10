/**
 * Tier 2 · M10 · Ambient power IoT (802.11bp) · The backscatter tier.
 *
 * The other half of P802.11bp's tag story, and the one the course never reached: a tag with no
 * oscillator at all, which answers by switching the reflection of the reader's own carrier on
 * and off. `engine/ampBs.ts` (the law and the frames), `engine/ampBsSta.ts` (the tag) and
 * `engine/ampReader.ts` (the EPC Gen2 inventory round) were built with engine tests and five
 * record types of their own, and before this lesson no course scenario produced one of them.
 *
 * What this lesson does NOT re-teach: the polling round (`@amp-intro`), the PPDU's two halves
 * and the OOK bit timing (`@amp-ppdu`), the ABOC/ACW draw and its Bianchi-style model
 * (`@amp-slots`), and the AC_BK contention around the round (`@amp-coexist`). It compares
 * against the third of those on purpose — 2^Q slots are the same question with a different
 * answer — and takes the other three as read.
 *
 * Every number in the prose below is pinned in tests/course/amp-backscatter.test.ts, measured
 * off this file's own scenario and variants at 1000 ms. The two reach figures are the engine's
 * closed forms (`monoReachM`, `activationReachM`), not arithmetic repeated here.
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
  why: '前面四课的标签至少还有一台自己的发射机：轮到它的时隙，它启动发射机把读数发送出去。这一课的标签连发射机也没有——它没有振荡器，无法产生任何信号，只能把读写器向它发送的那段载波反射回去，通过让天线（antenna）在反射与不反射之间切换来形成一串比特。所以应答不消耗它自己的能量，代价是信号要经过两次传播：去程一次路径损耗（path loss），回程又一次，反射时还有额外的损耗。能否读到取决于两个互不相关的距离：标签收到的功率是否足以将它唤醒，反射回来的信号能否被解出。读写器的接收本底来自自身泄漏到接收端的载波，提高激励功率时，回波信号与判决所依据的本底一同升高，相减时激励项相互抵消；因此唤醒距离增大到三倍多，可读取距离保持不变。这个房间里两个距离原本只相差不到两厘米，提高激励之后，远处那张标签被唤醒，多次应答却一次也没有被解出，还占用了其他标签的槽，这一秒读到的次数反而少了一次。清点也和其他发送一样要竞争信道：一次传输机会（transmit opportunity, TXOP）只能容纳一个完整的槽，一轮要跨越几次传输机会才能清点完毕。两张标签在同一个槽里同时应答时，若其中一张明显更近，读写器仍能解出近的那张，这一槽记为读到。',
  outcomes: [
    '说明一张没有振荡器的标签如何发出能够被解出的信号',
    '用反射回程的功率预算，解释为什么提高激励功率并不能延长可读取距离',
    '读出一轮 EPC Gen2 清点的四个计数：开启几个槽、读到几张、几次读不出、几个空槽',
    '一张标签读不到时，判断应先怀疑它是否上电，还是先怀疑回程信号是否足够强',
  ],
  needs: ['amp-slots'],
  terms: [
    { term: 'backscatter', plain: '反向散射：标签自己不产生载波，只把读写器的载波反射回去，用反射的开与关表示比特' },
    { term: 'mono-static', plain: '单站：发送激励和接收反射的是同一台设备的两根天线，因此它在发送的同时也接收到自身的信号' },
    { term: 'WUP-Excitation', plain: '一次传输机会第一帧之前的那段载波，专门用于为标签充电' },
    { term: 'BST-Excitation', plain: '命令发送完毕后读写器继续发送的那段载波：标签既依靠它维持供电，也依靠它应答' },
    { term: 'EPC', plain: '标签身上那 96 位的货品编号，一轮清点要获取的就是它' },
    { term: 'Q', plain: '读写器在 Query 里宣布的那个数，本轮共开启 2^Q 个槽' },
  ],
  picture: [
    { heading: '场景：一台读写器，六张标签', text: '一台 Wi-Fi 7 的接入点（access point, AP）兼作 RFID 读写器，放在桌面上；六张标签分布在它周围，四张在 15 cm 上，一张在 28 cm，一张在 40 cm。读写器和标签同在 1 m 高度上，这一点是有意安排的：整条链路（link）比到天花板的距离还短：在一米的距离上，回到读写器的信号已经低于读写器自身泄漏进接收端的干扰。房间里没有其他流量，这一轮单独进行。' },
    { kind: 'watch', jump: 0, heading: '先看哪些标签被唤醒', text: '载入仿真，跳到第一次上电。同一时刻有五张标签各记录一条上电记录，而 40 cm 上那一张在整整一秒内没有任何记录——在时间轴上，它与一张根本不存在的标签毫无区别。' },
    { heading: '没有发射机，如何应答', text: '标签没有载波侦听（carrier sense），也没有时钟：读写器的载波一停，它就失去供电、停止工作。所以上行（uplink, UL）不是由它选择一个时刻发送，而是读写器在命令发送完毕后继续发送载波——这段载波称为 BST-Excitation——标签在这段时间内按比特把自己的天线（antenna）在「反射」和「不反射」之间切换。反射本身比入射低 6 dB，而且信号要经过两次传播：去程一次路径损耗（path loss），回程又一次。' },
    { kind: 'formula', text: '回到读写器 = 激励 − 2 × 路损 − 6\n读写器的本机干扰 = 激励 − 20（天线隔离）−50（接收动态范围）', note: '两式相减，激励项相互抵消：余量恒等于 20 + 50 − 6 − 2 × 路损 = 64 − 2 × 路损。单站读写器的接收本底由自身泄漏到接收端的功率决定，所以把激励提高 10 dB，它分辨回应所依据的本底也提高 10 dB。' },
    { kind: 'steps', heading: '一个槽，从 Query 到 EPC', items: [
      '读写器发一帧 Query，宣布本轮的 Q；每张已唤醒的标签在 0 到 2^Q − 1 之间随机抽取一个计数。',
      '抽到 0 的标签立即在这一帧的 BST-Excitation 期间反射一个 16 位随机数 RN16；其他标签保存计数，在下一帧 QueryRep 到来时减一。',
      '读写器只要无差错地解出一个 RN16，就发一帧确认帧（acknowledgement, ACK）把它原样回送；RN16 与之相符的那张标签随后反射自己的 EPC。',
      '本场景启用了 Read，因此紧接着还有一帧 Read，标签把 8 个字节的存储内容反射回来，这一槽才算完成。',
      '一帧 QueryRep 开启下一个槽。每两帧命令之间只间隔 16 µs，而标签能在这 16 µs 内维持工作，正是因为下一帧紧接着就到来。',
    ] },
  ],
  numbers: [
    { heading: '两个距离，相差不到 2 cm', text: '这一层有两个互不相关的门限。上电那一条是标签的灵敏度（sensitivity）：入射功率低于 −20 dBm，它就无法被唤醒；按 10 dBm 的激励计算，这条线落在 0.309 m。可读取那一条就是上面那个余量：250 kb/s 的回应需要 3 dB 信噪比（signal-to-noise ratio, SNR），对应 0.328 m。本课六张标签所在的三个距离，分别位于两条线的内侧、内侧和外侧。' },
    { kind: 'table', heading: '一秒钟内六张标签的结果', head: ['标签', '距离', '入射功率', '回到读写器', '余量', '一秒读到'], rows: [
      ['Tag 1…4', '15 cm', '−13.72 dBm', '−53.43 dBm', '16.57 dB', '4、6、5、6 次'],
      ['Tag 5', '28 cm', '−19.14 dBm', '−64.28 dBm', '5.72 dB', '2 次'],
      ['Tag 6', '40 cm', '−22.24 dBm', '（未被唤醒）', '—', '0 次'],
    ] },
    { heading: '提高激励功率，读到的次数反而少一次', text: '变体「激励 20 dBm」把激励提高了 10 dB。上电那条线随之移到 0.978 m，于是 40 cm 上那张标签被唤醒，一秒钟内抽取了 10 次计数、反射了 10 次 RN16。可读取那条线保持不变，仍是 0.328 m——因为噪声地板（noise floor）随激励一起升高了 10 dB。那张标签回到读写器的余量是 −0.47 dB，一次也没有被解出，而它占用的那些槽使这一秒读到的次数从 23 降到 22。' },
    { heading: '4 ms 的预算只能容纳一个槽', text: '清点轮和其他发送一样要竞争信道，一次获得的传输机会（transmit opportunity, TXOP）是 4 ms。一个槽要完成 Query、ACK、Read 三帧，而第一帧之前还有 1 ms 的 WUP-Excitation。' },
    { kind: 'formula', text: 'Query 1516 + 16 + ACK 1009 + 16 + Read 1064 + 16 = 3637 µs', note: '开启下一个槽之前还要为可能到来的 RN16 预留 16 + 1009 µs，剩余时间不够，所以读写器不开启这个槽——留到下一次传输机会再完整开启。因此 Q = 2 的一轮需要四次传输机会、14.9 ms 才能清点完毕，而标签的计数正是跨传输机会保留的。' },
    { heading: '与 ABOC 那一课的对照', text: '那一课里时隙表是一次全部给出的，标签抽中哪个时隙就在哪个时隙里发送，一轮的长度由触发帧（Trigger frame）决定。这里没有时隙表：读写器逐帧询问，每一帧只开启一个槽，所以一轮能进行到哪里由空口时间（airtime）是否足够决定，而不是由标签抽到的数决定。一秒钟内 77 帧命令占用 82.8 ms，也就是 8.3 %。' },
    { heading: '「读不出」不等于「两张同时应答」', text: 'AMP_INVENTORY 的 collisions 统计的是「有反射、但读写器一个字节都读不出」的槽；读写器依靠激励期间的能量检测（energy detection, ED）区分它与空槽。15 cm 上那四张彼此相差不到百分之一分贝，两张同时应答就确实读不出；而 15 cm 与 28 cm 的标签同时应答时，近的那张高出 10.8 dB，捕获效应（capture effect）使读写器直接解出了近的那张，这一槽记为「读到」，远的那张只留下一条 RX_MISS。所以一秒钟 50 次 RN16 只得到 23 次读到，而 collisions 只有 9。' },
    { heading: 'Read 与 Write 的空口时间', text: 'Read 的回应是 8 个字节的存储内容，464 µs。Write 不同：标签需要 2 ms 才能应答，读写器必须持续发送载波等待它，于是一帧 Write 的下行（downlink, DL）PPDU（PHY protocol data unit）长 2964 µs。变体「打开 Write」启用这一选项之后，这一秒的记录流和基础场景逐条相同——4 ms 的传输机会里，一个 Write 也无法安排进去。' },
  ],
  sources: [
    'P802.11bp 仍是草案。反向散射这一层的时序取自规范框架 11-24/1613r20 的 PM 系列动议：T1 = 16 µs 与响应窗口的 ±20 % 余量是 PM-75 与 PM-74，1 ms 的 WUP 最短长度是 PM-73，[S, S, S] 共 24 个码片的上行同步是 PM-57，250 kb/s 与 1 Mb/s 两档上行速率是 PM-17。',
    '清点轮本身是 EPC Gen2（ISO/IEC 18000-63），规范框架以 MM-10、MM-29、FM-44 整体引用它。2^Q 个槽的算法、计数跨传输机会保留、以及 4 ms 的传输机会预算，都是本仿真器按提案 11-25/0061r0 取的模型值。',
    '10 dBm 的充电激励与 0 dBm 的回应激励是 11-25/0307r0 的 PEX_C 与 PEX_B；−20 dBm 的上电门限来自 11-24/0537r0；6 dB 的反射损耗取自 11-23/2038r1，20 dB 的天线隔离与 50 dB 的接收动态范围取自 11-25/0058r1；T2 = 16 µs 与 Write 的 T3 = 2 ms 取自 11-26/0120r0。这五份都是小组讨论过、而规范框架没有采纳其中具体数值的文稿。',
    '2.4 GHz 自由空间第一米的 40.2 dB 用的是 Friis 公式，而不是本仿真器 Wi-Fi 链路那条室内模型：室内那条在一米以内会外推出比自由空间还小的损耗，而反向散射的距离只有几十厘米。5 cm 处的下限是模型取值。',
  ],
  limits: [
    { kind: 'model-value', text: '6 dB 的反射损耗、20 dB 的天线隔离、50 dB 的接收动态范围这三个数，决定了「余量 = 64 − 2 × 路损」里的那个 64，而三者都取自小组讨论过、未被规范框架采纳的文稿。换一张读写器芯片，这三个数都会改变，0.328 m 这个距离也随之改变。' },
    { kind: 'unmodelled', text: '这条反射链路完全确定，不含快衰落，也不含逐次的功率起伏：15 cm 上那四张标签因此永远精确等距、等功率，两张在同一个槽里同时应答就一定读不出。真实货架上标签的朝向、金属与液体都会使入射功率逐次起伏好几分贝，于是「读不到」在真实设备上是一个概率，而不是本课这样一条明确的界线。' },
    { kind: 'model-value', text: '标签那 96 位的编号在本仿真器里由节点名称生成，4 ms 的传输机会预算也是本仿真器自行选定的。把它改为 10 ms，一轮清点所需的传输机会就从四次减少到两次，Write 也能够安排进去——这两个数草案里都没有。' },
    { kind: 'threshold', text: '上电在本仿真器里是一条硬门限：入射功率达到 −20 dBm 标签就工作，低 0.1 dB 就不产生任何记录。真实的能量收集电路是一段曲线，在门限附近它只是启动得更慢，或者启动之后来不及完成一帧应答；而这里 40 cm 上那张标签在基础场景的记录里，和一张不存在的标签完全一样。' },
  ],
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
  observe: [
    '跳到第一次上电：五张标签在同一时刻记录各自的入射功率，15 cm 是 −13.72 dBm，28 cm 是 −19.14 dBm。再查看 40 cm 上那一张，整整一秒内它没有任何记录。',
    '在右侧对象列表里选中 Tag 5（28 cm）——六张标签在平面图的缺省缩放下彼此只差几个像素，用列表选择，或者先用滚轮放大——再逐帧查看一轮。它每一轮都抽取计数、每一轮都反射 RN16，一秒钟十次；但它回到读写器的信号只有 5.72 dB 余量，同一个槽里只要还有一张 15 cm 的标签，它就只留下一条 RX_MISS。一秒钟它只被读到 2 次。',
    '载入「Q = 0：只开一个槽」变体：五张已唤醒的标签全部抽到 0，全部在同一个槽里反射，于是一秒钟读到 0 张，十个槽十次读不出。这是全部五种运行配置中唯一一个 collisions 等于开启槽数的。',
  ],
  tryThis: [
    '依次载入「激励 20 dBm」与「回应 1 Mb/s」。前者把上电距离从 0.309 m 增大到 0.978 m，读到的次数从 23 降到 22；后者把可读取距离从 0.328 m 缩短到 0.232 m，28 cm 上那张标签完全读不到了，次数降到 21，而命令占用的空口时间从 82.8 ms 降到 57.1 ms。两项调整都朝「更好」的方向改变读写器的参数，而两次读到的次数都更少。',
    '在编辑器里把读写器的 TXOP 从 4 ms 改成 10 ms，再启用 Write，重新载入：一轮清点所需的传输机会从四次减少到两次，而命令序列里第一次出现 Write。然后只把 TXOP 改回 4 ms——Write 立即又一帧都无法安排进去。',
  ],
  quiz: [
    {
      q: '把单站读写器的激励从 10 dBm 提高到 20 dBm，可读取距离为什么不变？',
      options: [
        '反射损耗也随之增加了 10 dB',
        '读写器的接收本底来自自身泄漏到接收端的功率，因此它的噪声地板随激励一起升高了 10 dB',
        '标签的反射效率随入射功率下降',
      ],
      answer: 1,
      explain: '回到读写器的功率是「激励 − 2 × 路损 − 6」，本机干扰是「激励 − 20 − 50」，两式相减激励就消掉了：余量恒等于 64 − 2 × 路损。上电那条线的计算里没有这个减法，所以它确实随激励一起增大。',
    },
    {
      q: '同一个槽里 15 cm 和 28 cm 两张标签同时反射，AMP_INVENTORY 会把这一槽记成什么？',
      options: [
        '一次 collisions',
        '一次读到，再加远那张的一条 RX_MISS',
        '一个空槽',
      ],
      answer: 1,
      explain: '两者到读写器相差 10.8 dB，捕获效应使它解出了近的那张，于是这一槽有一个 EPC 可记。collisions 统计的不是「几张同时应答」，而是「有应答、但一个字节都读不出」。',
    },
    {
      q: 'Q = 2 的一轮为什么要四次传输机会才清点完？',
      options: [
        '标签的计数在两次传输机会之间会清零，所以一次只能完成一个槽',
        '一次 4 ms 的传输机会能容纳一个槽的 Query、ACK 与 Read，剩余时间不够再开启一个槽',
        '读写器每次传输机会只允许发一帧命令',
      ],
      answer: 1,
      explain: 'Query 1516 + ACK 1009 + Read 1064 再加三段 16 µs 就是 3637 µs，而开下一个槽之前还要为可能到来的 RN16 预留 16 + 1009 µs。标签的计数恰恰是跨传输机会保留的，所以下一次传输机会接着开启第二个槽。',
    },
  ],
}
