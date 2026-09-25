/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · The narrowband radio shares 6 GHz too.
 *
 * The second half of the old `uwb-nba`. "A second radio does the talking" put the
 * control cycle on a narrowband radio and said nothing about where that radio
 * lives; this one puts it inside a Wi-Fi 7 router's 80 MHz on 6 GHz and turns on
 * the listen-before-talk rule the band comes with.
 *
 * The result is the lesson: the UWB side is flawless — 4.76 m across an empty
 * room, 8/8 fragments, 34.5 dB of margin — and the session still gets only four
 * distances out of seven blocks, and no position at all, in 1.3 seconds, because
 * a busy check costs a whole ranging block and a saturated 6 GHz laptop is almost
 * never quiet. Moving the
 * control channel 250 MHz down gives everything back; hopping gives back the
 * fraction of blocks the hash puts outside; switching the rule off gives back
 * most of the ranging and charges Wi-Fi 10.95 % of its throughput for it.
 *
 * It loads exactly the scene `uwb-nba` loads — the same builder, the same four
 * variants — so the split adds no new scenario and the recorded hashes of
 * `uwb-nba-coexist` are `uwb-nba`'s, value for value. Every number quoted below
 * is pinned in tests/course/uwb-nba-coexist.test.ts.
 */
import { J, firstNbLbt, firstNbPoll, firstUwbRange, type Lesson } from '../lessonKit'
import { uwbNbaScenario } from './uwb-nba'

export const uwbNbaCoexist: Lesson = {
  id: 'uwb-nba-coexist',
  module: 15,
  title: '窄带射频也共享 6 GHz',
  why: '那部小小的控制射频总得住在某个地方，而分给它的，正是最新的那个 Wi-Fi 频段。想用这个频段，就得守一条规矩：先听，若空口上已经有人在说话，就闭嘴。在一间摆着忙碌路由器的屋子里，这条规矩几乎从不放行——而一个说不出话的超宽带（UWB）测距会话，什么也量不出来。这一课要把这笔交易的两面都算清楚。',
  outcomes: [
    '说出一台设备在共享的窄带（narrowband, NB）信道上开口之前必须先做什么',
    '解释为什么一次“不许发”赔上的是整整一个测距块（ranging block），而不是一条消息',
    '把跳变（channel hopping）、挪走控制信道、以及干脆关掉规则这三条路放在一起权衡',
  ],
  needs: ['uwb-nba', 'uwb-coexist'],
  terms: [
    { term: 'LBT', plain: '先听后发：开口之前先量一量信道，若已经有人在用就保持安静' },
    { term: 'threshold', plain: '门限：一次读数要与之比较的那个电平——高过它算信道忙，低于它算空闲' },
    { term: 'allow list', plain: '一个会话获准使用的那一小组控制信道' },
    { term: 'hop', plain: '按一条两端都能自行算出的规则，在相邻两个块之间换用允许列表里的另一个信道' },
  ],
  picture: [
    { heading: '那部小射频住在哪里', text: '这部控制射频就调在 Wi-Fi 的隔壁：两百多个窄信道，每个的宽度都只是一条 Wi-Fi 信道的一小块。于是一条 Wi-Fi 信道就能一口气盖住其中几十个——而本会话用的那个控制信道，恰好压在头顶那台路由器身下。' },
    { heading: '这个频段附带的规矩', text: '在那里，设备不能想发就发。每发一条窄带消息之前，它都得先量一量信道——先听后发（listen before talk, LBT）——若量到的能量超过一个固定的电平——门限——就必须保持安静。这项测试说到底只是一次功率读数：它问的是“此刻是否有人在发”，而不是“这条消息发出去能不能活下来”。' },
    { kind: 'watch', jump: 0, heading: '看一个块提前收场', text: '载入仿真、按下播放，然后跳到第一次判忙。那一行写着它量到的电平、用来比对的门限，以及随之而来的结果：这台设备把这个块剩下的部分全跳过了。' },
    { heading: '只问“此刻谁在发”的检测', text: '手机离路由器一米半，离那台正满负荷上传的笔记本也不过几步。在这样的距离上，它们俩不论发什么，落到手机这里都远高于门限。于是这项检测已经和距离无关了：几乎每跑一次，它给出的答案都是“有人在说话”。' },
    { heading: '一次“不许发”赔上的是一个块', text: '而且“不许发”并不是一次退避（backoff）。设备不会稍等片刻再试：它在本测距块余下的时间里，索性不再发出任何窄带帧。没有 Poll 就没有一轮对话，于是这个块后面几轮照样按格子跑——锚点（anchor）们按时到场、干等着——而手机在每一轮里都一声不吭。' },
    { heading: '跳变是在平均，不是在躲开', text: '一个显而易见的办法是别老待在原地：给会话一张单子，上面写着它可以用的那几个控制信道——这就是允许列表（allow list）——再让它一个块一个块地换用其中另一个，这一换就叫跳变。这里列表的一半是避开路由器的。于是会话拿回的，正是“跳变恰好把块丢到清静处”的那个比例，其余照赔——因为这个选择在整块之内不变，一个块要么完整，要么全没。' },
    { heading: '控制信道该放在哪里', text: '这笔交易的另一面并不好看：把规则关掉，会话立刻又能干活，代价由 Wi-Fi 链路（link）来付。守规矩的那套配置恰恰是没用的那套，而你能出货哪一套，只有监管说了算。真正的教训因此在这儿：控制信道根本不必待在 Wi-Fi 所在的频段里，它要的只是一薄片没人要的频谱——而这样的薄片有好几百。' },
  ],
  numbers: [
    { kind: 'formula', heading: '门限，以及它针对的那条信道', text: 'threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm', note: '一个窄带信道宽 2.5 MHz，而规则是按每兆赫写的，所以设备真正拿来比对的电平是 −71.02 dBm；每次发射之前至少评估 9 µs。' },
    { kind: 'table', heading: '手机在“听”的时候听到了什么', head: [
      '来源', '手机处的电平',
      '与 −71.02 dBm 相比',
    ], rows: [
      ['路由器的 80 MHz 猝发，相距 1.50 m', '−48.23 dBm', '22.8 dB over'],
      ['路由器的 20 MHz 控制帧（control frame）', '−42.21 dBm', '28.8 dB over'],
      ['以 15 dBm 发射的笔记本，相距 3.35 m', '−63.72 dBm', '7.3 dB over'],
    ] },
    { text: '手机那七次判忙，每一次读到的都是 −63.72 dBm：三步之外那台正在上传的笔记本。七个块，七次检测，七个被跳过；另外还有一个锚点，也因自己的两次判忙赔掉两个块。' },
    { kind: 'table', heading: '同一个控制信道的四种放法', head: [
      '场景', '窄带信道',
      '跳过的块', '手机测距',
      '定位',
    ], rows: [
      ['落在路由器的信道之内', '200 · 6301.25 MHz', '7 of 7', '4', '0'],
      ['避开它', '100 · 6051.25 MHz', '0', '28', '7'],
      ['在四个信道间跳变', '100 / 150 / 200 / 210', '4 of 7', '13', '3'],
      ['落在之内，且不先听', '200 · 6301.25 MHz', '0', '21', '5'],
    ] },
    { text: '七个块里只有两个有所收获：它们的 Poll 恰好赶在信道空闲的那一瞬发了出去。两个块合起来给出四个距离，却依然解不出定位，因为解一个定位要同一个块里的三个距离。' },
    { heading: '反过来的那一侧', text: '反过来看，这部窄带射频也远称不上无害。它那 10 dBm 全挤在一个 2.5 MHz 的信道里，按此推算，它在 15.07 m 外仍够得着 Wi-Fi 的能量检测门限（energy detection threshold）——比这个房间还长。于是这里发出的每一条控制消息，屋里每一台 Wi-Fi 收发机都听得见。' },
    { text: '“先听”并不能让一条消息变得无害，它只是让这样的消息变少。规则开着时，只有十条上了空口，其后有六个 Wi-Fi 帧解不出来；关掉之后，是 108 条消息与 87 次失败。' },
    { heading: '差额由谁来付', text: '付账的是笔记本。它的吞吐从 407.215 Mb/s 掉到 362.631 Mb/s，少掉 44.58 Mb/s，占它原有吞吐的 10.95 %——这就是“会话能干活”的标价。' },
    { kind: 'steps', heading: '一次判忙，一步一步来', items: [
      '每发一条窄带消息之前，设备先问一句：这条信道要不要求我先听？两个频段里，上面那个要求，下面那个不要求。',
      '若要求，它就读一下这条信道那 2.5 MHz 里已经有多少功率——这里只读一个瞬时值，代替规则要求的那段评估时间。',
      '它把这个读数与门限相比，而门限就是那条“每兆赫多少”的限值摊到整条信道的宽度上。低于门限就发；等于或高于，这条信道就算忙。',
      '判忙并不是一次退避。设备会把整个测距块记下，在这个块余下的时间里，一条窄带消息也不发。',
      '没有 Poll 就没有一轮。锚点照样按时出现在自己的时隙里，干等，然后超时；这个块就这样在什么也没量到的情况下结束。',
      '下一个块会重新从允许列表里抽一条信道，所以会跳变的会话，拿回的恰好是“抽签把块丢到清静处”的那个比例。',
    ] },
    { kind: 'table', heading: '这六步，落在本场景上', head: [
      '步骤', '本场景',
    ], rows: [
      ['信道，而且它确实要求先听', '200 · 6301.25 MHz'],
      ['拿来比对的门限', '−75 dBm/MHz + 10·log10(2.5) = −71.02 dBm'],
      ['手机读到的', '−63.72 dBm'],
      ['读数对门限：忙', '−63.72 ≥ −71.02 dBm'],
      ['七个块里被跳过的', '7'],
      ['测距数，与定位数', '4 · 0'],
      ['笔记本付的账', '407.215 → 362.631 Mb/s · −44.58 · 10.95 %'],
    ] },
  ],
  deeper: [
    { kind: 'formula', heading: '这项检测能看多远', text: '20 dBm 摊在 80 MHz 上 → 20 + 10·log10(2.5 / 80) = 4.95 dBm 落在一个窄带信道内\n4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m', note: '这是算术，不是测量：20 dBm 的 80 MHz 发射，在自己带内任意 2.5 MHz 的一片里都是 4.95 dBm；按 Wi-Fi 链路自己的室内传播律，它在 8.62 m 处跨过门限。手机离路由器 1.50 m，稳稳落在这个半径之内——这就是它的答案从不改变的原因。' },
    { heading: '逐块看那次跳变', text: '允许列表 [100, 150, 200, 210] 里有两个信道避开了路由器的 80 MHz，另两个落在里面——6326.25 MHz 同样在里面。第 b 块取 list[hash(“7:b”) mod 4]，在这七个块上依次给出 100、210、200、150、100、210、200。第 0、3、4 块落在外面，完整跑完；第 1、2、5、6 块落在里面，被跳过，其中第 5 块在报告时隙被拦下之前还发出了一个距离。七次定位变成三次：跳变买到的，恰好是散列把多少个块丢到清静处的那个比例。' },
    { heading: '数一数 Wi-Fi 让出了多少', text: '没有哪条记录会写明“是谁害得这台 Wi-Fi 收发机退让”，所以改数另一件事：落在某条窄带消息期间、且仅因能量而转为“忙”的 CCA 跳变——关掉规则后，1.3 秒里 44 次；而在控制信道避开路由器的那个场景里，一次也没有。它不是 108 的两倍：本来就忙着、或者正在发的收发机，根本不会再跳一次。这部射频和隔壁那部宽带射频完全是两回事：一帧测距帧的 −14 dBm 摊在 499.2 MHz 上，只在约 40 cm 以内才碰得到同一个门限。模型的简化在另一个方向上也露了馅：时隙开头的一次功率读数，对随后的 576 µs 什么也没说，于是在一条控制消息中途开始的那个 Wi-Fi 帧，照样撞了上去。' },
    { heading: '反方向飞回来的东西', text: '把规则关掉，有七条窄带消息死在手机这里——五条 Report、两条 Response——每一条都倒在路由器自己那帧 20 MHz 控制帧之下：它从 1.50 m 外飞来，到达时 −42.21 dBm。头一条写着 “uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”。一条控制消息没有余量可花：它的接收端到 −100 dBm 就见了底，外来功率只要追平它自己的电平，就够了。' },
    { heading: '默认的允许列表指向哪里', text: '整套规划共有 250 个 2.5 MHz 的信道：UNII-3 里 50 个，自 5726.25 MHz 起；UNII-5——也就是 6 GHz Wi-Fi 频段——里 200 个，自 5926.25 MHz 起。一条 20 MHz 的 Wi-Fi 信道能盖住其中八个，而这台路由器的 80 MHz 整整包住三十二个，编号 186 到 217。一个会话自带的默认允许列表是 [3]——5733.75 MHz，位于 UNII-3，落在整个 6 GHz Wi-Fi 频段之下，那里任何 Wi-Fi 信道都够不着，先听后发在那里也是可选的。“避开路由器的信道”所用的 100 号，是同一个主意的弱化版：它仍在 UNII-5，仍受这条规则管，只是其上边沿与路由器的下边沿之间隔着 212.5 MHz 的空白频谱，于是规则从来没有什么可拦的。' },
  ],
  sources: [
    '本课有一层来自法规：−75 dBm/MHz 的能量检测门限与至少 9 µs 的评估时间，出自 ETSI EN 303 687 对“基于帧的设备”的规定，P802.15.4ab 把它用在自己位于 UNII-5 的窄带信道上。',
    '250 个窄带信道、带“整块中止”后果的先听后发规则、以及按块跳变，都来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票再循环阶段，版本 D5.0。该草案仅对会员开放，所以这里改写自 TG4ab 的两篇提案文稿：15-22/0381r5（信道规划、先听后发与跳变）与 15-23/0100r2（信道数目）。已投票的草案可能与之不同。',
    '以下是模型取值：信道中心频率的公式，是依据已公开的信道数目与频段边界反推出来的；按块跳变用的是仿真器自己的字符串散列，而草案规定的是以会话种子为密钥的 AES-128-CTR；草案要求至少评估 9 µs，这里以一次瞬时功率读数代之。',
    '两条路径损耗公式都是模型的，而且每一路发射都沿用自己发射端的那一条：Wi-Fi 按室内衰减指数 3 传播——一米处 46.7 dB，加 30·log10 d，6 GHz 再加 1.2 dB；窄带射频按自由空间传播，200 号信道一米处 48.44 dB。−62 dBm 的能量检测门限与 6 GHz 的信道编号，同样属于模型。',
  ],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: '避开路由器的信道', scenario: () => uwbNbaScenario('outside') },
    { label: '在四个信道间跳变', scenario: () => uwbNbaScenario('hop') },
    { label: '不先听后发', scenario: () => uwbNbaScenario('noLbt') },
    { label: '一次只问一个锚点', scenario: () => uwbNbaScenario('pairwise') },
  ],
  jumps: [
    J('终结这个块的那次“忙”检测', firstNbLbt),
    J('唯一发得出去的那帧窄带 Poll', firstNbPoll),
    J('整段运行里第一个发得出去的距离', firstUwbRange),
  ],
  observe: [
    '21.000 ms 处轮到手机自己的报告时隙：“uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”。此后直到这个块结束，空口上再也听不到手机。',
    '锚点们替这段沉默开出了账单：“anchor-1 UWB slot 42: no nb-report from uwb-1”，到了下一个块又是 “anchor-1 UWB slot 0: no nb-poll from uwb-1”。格子照样往下跑，只是少了它。',
    '手机的检视面板上写着 “200 · 6301.25 MHz”，而“先听后发”一行是 “7 次忙 · 跳过 7 个块”。它那几行片段（fragment）纹丝不动，而超时有 21 次，测出的距离只有四个。',
  ],
  tryThis: [
    '把其余三个场景依次载入。“避开路由器的信道”：一次判忙也没有，28 个距离，每个块都解出定位，而 Wi-Fi 这一侧与完全没有测距会话的那次运行毫无差别。“在四个信道间跳变”：三个块落到清静处，给出三次定位。“不先听后发”：21 个距离、5 次定位，而这回改成控制消息死在手机这里。',
  ],
  quiz: [
    {
      q: '手机离路由器只有 1.50 m，它的片段还高出接收门限 34.5 dB。为什么基础场景七个块里只拿到四个距离？',
      options: [
        '片段被路由器的猝发压住了',
        '先听后发测的是能量，不是余量：光是那台笔记本在手机处就有 −63.72 dBm，而一次判忙要赔上整整一个块',
        '在那个距离上窄带接收机低于自己的灵敏度（sensitivity）',
      ],
      answer: 1,
      explain: '两条链路在这里都好得很，失败的是一条规则。七个块，七次读到 −63.72 dBm 的检测，七个块被跳过——而那两个赶在判忙之前把 Poll 发出去的块，各自也只给出两个距离，凑不齐解一次定位所需的三个。',
    },
    {
      q: '关掉规则之后，会话拿到的是 21 个距离，而不是四个。这让 Wi-Fi 链路付出了什么？',
      options: [
        '没有可测的代价——10 dBm 远低于能量检测门限',
        '87 个帧解调失败，以及笔记本吞吐的 10.95 %：362.631 Mb/s 对 407.215 Mb/s',
        '只是退避：链路损失了时间，但没有帧丢失',
      ],
      answer: 1,
      explain: '2.5 MHz 里的 10 dBm 到 15.07 m 处仍够得着门限，比这个房间还远。先听改变的是消息的条数，而不是每条消息造成的后果。',
    },
  ],
}
