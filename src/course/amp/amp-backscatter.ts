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
  title: '反向散射：标签靠反射说话',
  why: '前面四课的标签至少还有一台自己的发射机：轮到它的时隙，它点一个载波把读数送出去。这一课的标签连这个也没有——它身上没有振荡器，产生不了任何信号，只能把读写器正对着它发的那段载波反射回去，用反射的开与关拼出一串比特。于是两件事同时成立：它应答不花自己的能量，而读写器的功率开得再大，也不会让它变得更容易被解出来。',
  outcomes: [
    '说清一张没有振荡器的标签凭什么能发出可以被解出的信号',
    '用反射这条回程的功率预算，解释为什么把激励调大并不能延长读得到的距离',
    '读出一轮 EPC Gen2 清点的四个计数：开出几个槽、读到几张、几次读不出、几个空槽',
    '一张标签读不到时，判断该先怀疑它有没有上电，还是先怀疑回程够不够',
  ],
  needs: ['amp-slots'],
  terms: [
    { term: 'backscatter', plain: '反向散射：标签自己不产生载波，只把读写器的载波反射回去，用反射的开与关表示比特' },
    { term: 'mono-static', plain: '单站：发激励和收反射是同一台设备的两根天线，于是它一边发一边听着自己' },
    { term: 'WUP-Excitation', plain: '一次传输机会的头一帧前面那段载波，专门用来把标签充上电' },
    { term: 'BST-Excitation', plain: '命令发完之后读写器继续点着的那段载波：标签既靠它活着，也靠它应答' },
    { term: 'EPC', plain: '标签身上那 96 位的货品编号，一轮清点要拿到的就是它' },
    { term: 'Q', plain: '读写器在 Query 里宣布的那个数，本轮一共开出 2^Q 个槽' },
  ],
  picture: [
    { heading: '场景：一台读写器，六张标签', text: '一台 Wi-Fi 7 的接入点（access point, AP）兼作 RFID 读写器，摆在桌面上；六张标签围着它，四张在 15 cm 上，一张在 28 cm，一张在 40 cm。读写器和标签同在 1 m 高度上，这一点是刻意的：整条链路（link）比到天花板的距离还短，差一米就什么也不剩了。房间里没有别的流量，这一轮单独跑。' },
    { kind: 'watch', jump: 0, heading: '先看谁活了过来', text: '载入仿真，跳到第一次上电。同一瞬间有五张标签各记下一条上电记录，而 40 cm 上那一张整整一秒钟一条记录也没有——在时间轴上，它和一张根本不存在的标签长得一模一样。' },
    { heading: '没有发射机，怎么应答', text: '标签没有载波侦听（carrier sense），也没有时钟：读写器的载波一停，它就不存在了。所以上行（uplink, UL）不是它挑一个时刻发送，而是读写器把命令发完之后继续点着载波——这段载波叫 BST-Excitation——标签在这段里按比特把自己的天线（antenna）在「反射」和「不反射」之间切换。反射本身比入射低 6 dB，而且这条路要走两遍：去的时候一次路径损耗（path loss），回来又一次。' },
    { kind: 'formula', text: '回到读写器 = 激励 − 2 × 路损 − 6\n读写器的本机干扰 = 激励 − 20（天线隔离）−50（接收动态范围）', note: '两式相减，激励从两边一起消掉：余量恒等于 20 + 50 − 6 − 2 × 路损 = 64 − 2 × 路损。单站读写器听的是自己漏进接收端的那点功率，所以把激励抬高 10 dB，它要在上面分辨回应的那个底也抬高 10 dB。' },
    { kind: 'steps', heading: '一个槽，从 Query 到 EPC', items: [
      '读写器发一帧 Query，宣布本轮的 Q；每张醒着的标签在 0 到 2^Q − 1 之间抽一个计数。',
      '抽到 0 的那些立刻在这一帧的 BST-Excitation 里反射一个 16 位随机数 RN16；别的标签把计数记住，等下一帧 QueryRep 再减一。',
      '读写器只要干净地解出一个 RN16，就发一帧确认帧（acknowledgement, ACK）把它原样念回去；被念到的那张标签这才反射自己的 EPC。',
      '本场景打开了 Read，于是紧接着再来一帧 Read，标签把 8 个字节的存储内容反射回来，这一槽才算走完。',
      '一帧 QueryRep 开下一个槽。每两帧命令之间只隔 16 µs，而标签能在这 16 µs 里活下来，正是因为下一帧紧接着就来了。',
    ] },
  ],
  numbers: [
    { heading: '两条距离，差不到 2 cm', text: '这一层有两个互不相干的门限。上电那一条是标签的灵敏度（sensitivity）：入射功率不到 −20 dBm，它醒不过来；按 10 dBm 的激励算，这条线落在 0.309 m。读得到那一条是上面那个余量：250 kb/s 的回应要 3 dB 信噪比（signal-to-noise ratio, SNR），对应 0.328 m。本课六张标签分别落在两条线的内侧、内侧和外侧。' },
    { kind: 'table', heading: '一秒钟里六张标签的下场', head: ['标签', '距离', '入射功率', '回到读写器', '余量', '一秒读到'], rows: [
      ['Tag 1…4', '15 cm', '−13.72 dBm', '−53.43 dBm', '16.57 dB', '4、6、5、6 次'],
      ['Tag 5', '28 cm', '−19.14 dBm', '−64.28 dBm', '5.72 dB', '2 次'],
      ['Tag 6', '40 cm', '−22.24 dBm', '（没醒过）', '—', '0 次'],
    ] },
    { heading: '把读写器调大，反而少读到一次', text: '变体「激励 20 dBm」把激励抬了 10 dB。上电那条线随之推到 0.978 m，于是 40 cm 上那张标签醒了，一秒钟抽了 10 次计数、反射了 10 次 RN16。读得到那条线一动不动，还是 0.328 m——因为噪声地板（noise floor）跟着激励一起抬了 10 dB。那张标签回到读写器的余量是 −0.47 dB，一次也没被解出，而它占掉的那些槽让这一秒读到的次数从 23 降到 22。' },
    { heading: '一次 4 ms 的传输机会只装得下一个槽', text: '清点轮和别的发送一样要竞争信道，一次拿到的传输机会（transmit opportunity, TXOP）是 4 ms。一个槽要走完 Query、ACK、Read 三帧，而头一帧前面还挂着 1 ms 的 WUP-Excitation。' },
    { kind: 'formula', text: 'Query 1516 + 16 + ACK 1009 + 16 + Read 1064 + 16 = 3637 µs', note: '开下一个槽之前还要为可能到来的 RN16 预留 16 + 1009 µs，装不下，所以读写器宁可不开——留到下一次传输机会整个开。于是 Q = 2 的一轮要四次传输机会、14.9 ms 才清点完，而标签的计数正是跨传输机会保留的。' },
    { heading: '和 ABOC 那一课的对照', text: '《时隙化随机接入》里时隙表是读写器一次给齐的，标签抽中哪个就在哪个里发，一轮的长度由触发帧（Trigger frame）决定。这里没有时隙表：读写器一帧一帧地问，每一帧只开一个槽，所以一轮能走多远由空口时间（airtime）够不够决定，而不是由标签抽到了几决定。一秒钟 77 帧命令占掉 82.8 ms，也就是 8.3 %。' },
    { heading: '「读不出」不等于「两张一起答」', text: 'AMP_INVENTORY 的 collisions 数的是「有东西反射、而读写器一个字节都读不出」的槽；读写器分辨它和空槽靠的是激励里的能量检测（energy detection, ED）。15 cm 上那四张彼此相差不到百分之一分贝，两张撞在一起就真的读不出；而 15 cm 和 28 cm 撞在一起时近的那张高出 10.8 dB，捕获效应（capture effect）直接把近的那张解了出来，这一槽记成「读到」，远的那张只留下一条 RX_MISS。所以一秒钟 50 次 RN16 只换来 23 次读到，而 collisions 只有 9。' },
    { heading: 'Read 与 Write 的空口时间', text: 'Read 的回应是 8 个字节的存储内容，464 µs。Write 不一样：标签要 2 ms 才答得出来，读写器得把载波一直点着等它，于是一帧 Write 的下行（downlink, DL）PPDU（PHY protocol data unit）长 2964 µs。变体「打开 Write」把这个开关打开之后，这一秒的记录流和基础场景逐条相同——4 ms 的传输机会里，一个 Write 也排不进去。' },
  ],
  sources: [
    'P802.11bp 仍是草案。反向散射这一层的时序取自规范框架 11-24/1613r20 的 PM 系列动议：T1 = 16 µs 与响应窗口的 ±20 % 余量是 PM-75 与 PM-74，1 ms 的 WUP 最短长度是 PM-73，[S, S, S] 共 24 个码片的上行同步是 PM-57，250 kb/s 与 1 Mb/s 两档上行速率是 PM-17。',
    '清点轮本身是 EPC Gen2（ISO/IEC 18000-63），规范框架以 MM-10、MM-29、FM-44 整体引用它。2^Q 个槽的算法、计数跨传输机会保留、以及 4 ms 的传输机会预算，都是本仿真器按提案 11-25/0061r0 取的模型值。',
    '10 dBm 的充电激励与 0 dBm 的回应激励是 11-25/0307r0 的 PEX_C 与 PEX_B；−20 dBm 的上电门限来自 11-24/0537r0；6 dB 的反射损耗取自 11-23/2038r1，20 dB 的天线隔离与 50 dB 的接收动态范围取自 11-25/0058r1；T2 = 16 µs 与 Write 的 T3 = 2 ms 取自 11-26/0120r0。这五份都是小组讨论过、而规范框架没有采纳其中具体数值的文稿。',
    '2.4 GHz 自由空间第一米的 40.2 dB 用的是 Friis 公式，而不是本仿真器 Wi-Fi 链路那条室内模型：室内那条在一米以内会外推出比自由空间还小的损耗，而反向散射是几十厘米的事。5 cm 处的下限是模型取值。',
  ],
  limits: [
    { kind: 'model-value', text: '6 dB 的反射损耗、20 dB 的天线隔离、50 dB 的接收动态范围这三个数，决定了「余量 = 64 − 2 × 路损」里的那个 64，而三者都取自小组讨论过、未被规范框架采纳的文稿。换一张读写器芯片，这三个数都会变，而 0.328 m 这个距离跟着它们变。' },
    { kind: 'unmodelled', text: '这条反射链路完全确定，不含快衰落，也不含逐次的功率起伏：15 cm 上那四张标签因此永远精确等距、等功率，两张撞在同一个槽里就一定读不出。真实货架上标签的朝向、金属与液体都会让入射功率逐次起伏好几分贝，于是「读不到」在真实设备上是一个概率，而不是本课这样一条干净的线。' },
    { kind: 'model-value', text: '标签那 96 位的编号在本仿真器里是从节点名字推出来的，4 ms 的传输机会预算也是本仿真器自己选的。把它改到 10 ms，一轮清点就从四次传输机会缩到两次，而 Write 也开始排得进去——这两个数草案里都没有。' },
    { kind: 'threshold', text: '上电在本仿真器里是一条硬门限：入射功率到 −20 dBm 标签就工作，差 0.1 dB 就一条记录也不留。真实的能量收集电路是一段曲线，门限附近它只是启动得更慢、或者启动之后来不及答完一帧；而这里 40 cm 上那张标签在基础场景的记录里，和一张不存在的标签完全一样。' },
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
    J('开轮的那帧 Query', firstBsQuery),
    J('第一次反射回 EPC', firstBsEpc),
    J('第一个没清点完的轮次', firstBsPartialRound),
    J('第一个读不出任何回应的槽', firstBsCollidedSlot),
  ],
  observe: [
    '跳到第一次上电：五张标签在同一瞬间记下各自的入射功率，15 cm 是 −13.72 dBm，28 cm 是 −19.14 dBm。再去看 40 cm 上那一张，整整一秒钟它一条记录也没有。',
    '在右侧对象列表里选中 Tag 5（28 cm）——六张标签在平面图的缺省缩放下彼此只差几个像素，用列表点或者先滚轮放大——再逐帧走过一轮。它每一轮都抽计数、每一轮都反射 RN16，一秒钟十次；可它回到读写器只剩 5.72 dB 余量，同一个槽里只要还有一张 15 cm 的标签，它就只留下一条 RX_MISS。一秒钟它只被读到 2 次。',
    '载入「Q = 0：只开一个槽」变体：五张醒着的标签全部抽到 0，全部在同一个槽里反射，于是一秒钟读到 0 张，十个槽十次读不出。这是全部五种跑法里唯一一个 collisions 等于开出槽数的。',
  ],
  tryThis: [
    '依次载入「激励 20 dBm」与「回应 1 Mb/s」。前者把上电距离从 0.309 m 推到 0.978 m，读到的次数从 23 降到 22；后者把读得到的距离从 0.328 m 收到 0.232 m，28 cm 上那张标签彻底读不到了，次数降到 21，而命令占掉的空口时间从 82.8 ms 降到 57.1 ms。两个旋钮都把读写器往「更好」的方向拧，而两次都读到更少。',
    '在编辑器里把读写器的 TXOP 从 4 ms 改成 10 ms，再把 Write 打开，重新载入：一轮清点从四次传输机会缩到两次，而命令序列里第一次出现 Write。然后只把 TXOP 改回 4 ms——Write 立刻又一帧都排不进去。',
  ],
  quiz: [
    {
      q: '把单站读写器的激励从 10 dBm 抬到 20 dBm，读得到的距离为什么不变？',
      options: [
        '反射损耗也跟着涨了 10 dB',
        '读写器听的是自己漏进接收端的功率，于是它的噪声地板跟着激励一起抬了 10 dB',
        '标签的反射效率随入射功率下降',
      ],
      answer: 1,
      explain: '回到读写器的功率是「激励 − 2 × 路损 − 6」，本机干扰是「激励 − 20 − 50」，两式相减激励就消掉了：余量恒等于 64 − 2 × 路损。上电那条线里没有这个减法，所以它确实跟着激励一起涨。',
    },
    {
      q: '同一个槽里 15 cm 和 28 cm 两张标签一起反射，AMP_INVENTORY 会把这一槽记成什么？',
      options: [
        '一次 collisions',
        '一次读到，再加远那张的一条 RX_MISS',
        '一个空槽',
      ],
      answer: 1,
      explain: '两者到读写器相差 10.8 dB，捕获效应让它解出了近的那张，于是这一槽有一个 EPC 可记。collisions 数的不是「几张一起答」，而是「答了、而一个字节都读不出」。',
    },
    {
      q: 'Q = 2 的一轮为什么要四次传输机会才清点完？',
      options: [
        '标签的计数在两次传输机会之间会清零，所以一次只能走一个槽',
        '一次 4 ms 的传输机会装得下一个槽的 Query、ACK 与 Read，再开一个槽的余量就不够了',
        '读写器每次传输机会只允许发一帧命令',
      ],
      answer: 1,
      explain: 'Query 1516 + ACK 1009 + Read 1064 再加三段 16 µs 就是 3637 µs，而开下一个槽之前还要为可能到来的 RN16 预留 16 + 1009 µs。标签的计数恰恰是跨传输机会保留的，所以下一次传输机会接着开第二个槽。',
    },
  ],
}
