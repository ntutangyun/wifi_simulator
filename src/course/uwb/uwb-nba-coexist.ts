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
import { J, N, firstNbLbt, firstNbPoll, firstUwbRange, type Lesson } from '../lessonKit'
import { uwbNbaScenario } from './uwb-nba'

export const uwbNbaCoexist: Lesson = {
  id: 'uwb-nba-coexist',
  module: 15,
  title: { en: 'The narrowband radio shares 6 GHz too', zh: '窄带射频也共享 6 GHz' },
  why: {
    en: 'The little control radio has to live somewhere, and the place it was given is the newest Wi-Fi band. Sharing that band comes with a rule: listen first, and keep quiet if anyone else is already on the air. In a room with a busy router that rule almost never lets the control radio speak — and a ranging session that cannot speak measures nothing. This lesson prices both sides of that bargain.',
    zh: '那部小小的控制射频总得住在某个地方，而分给它的，正是最新的那个 Wi-Fi 频段。想用这个频段，就得守一条规矩：先听，若空口上已经有人在说话，就闭嘴。在一间摆着忙碌路由器的屋子里，这条规矩几乎从不放行——而一个说不出话的测距会话，什么也量不出来。这一课要把这笔交易的两面都算清楚。',
  },
  outcomes: [
    { en: 'say what a device must do before it may speak on a shared narrowband channel',
      zh: '说出一台设备在共享的窄带信道上开口之前必须先做什么' },
    { en: 'explain why one refusal costs a whole ranging block rather than one message',
      zh: '解释为什么一次“不许发”赔上的是整整一个测距块，而不是一条消息' },
    { en: 'weigh hopping, moving the control channel and switching the rule off against each other',
      zh: '把跳变、挪走控制信道、以及干脆关掉规则这三条路放在一起权衡' },
  ],
  needs: ['uwb-nba', 'uwb-coexist'],
  terms: [
    { term: 'LBT', plain: {
      en: 'listen before talk: measure the channel first, and stay silent if it is already in use',
      zh: '先听后发：开口之前先量一量信道，若已经有人在用就保持安静',
    } },
    { term: 'allow list', plain: {
      en: 'the small set of control channels one session is permitted to use',
      zh: '一个会话获准使用的那一小组控制信道',
    } },
    { term: 'hop', plain: {
      en: 'move to another channel of the allow list from one block to the next, by a rule both ends can work out',
      zh: '按一条两端都能自行算出的规则，在相邻两个块之间换用允许列表里的另一个信道',
    } },
  ],
  picture: [
    { heading: { en: 'Where the small radio lives', zh: '那部小射频住在哪里' }, text: {
      en: 'The control radio is tuned in the same neighbourhood as Wi-Fi: a couple of hundred narrow channels, each a small fraction of what one Wi-Fi channel covers. So a single Wi-Fi channel can hold dozens of them at once — and this session’s control channel is one of the ones the router overhead is sitting on.',
      zh: '这部控制射频就调在 Wi-Fi 的隔壁：两百多个窄信道，每个的宽度都只是一条 Wi-Fi 信道的一小块。于是一条 Wi-Fi 信道就能一口气盖住其中几十个——而本会话用的那个控制信道，恰好压在头顶那台路由器身下。',
    } },
    { heading: { en: 'The rule the band comes with', zh: '这个频段附带的规矩' }, text: {
      en: 'There a device may not simply transmit. Before every narrowband message it has to measure the channel — listen before talk, LBT — and if it finds more energy there than a fixed threshold it must stay silent. The test is a power reading, nothing more: it asks whether anybody is on the air, not whether this message would have survived.',
      zh: '在那里，设备不能想发就发。每发一条窄带消息之前，它都得先量一量信道——先听后发，即 LBT——若量到的能量超过一个固定门限，就必须保持安静。这项测试说到底只是一次功率读数：它问的是“此刻是否有人在发”，而不是“这条消息发出去能不能活下来”。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Watch a block end early', zh: '看一个块提前收场' }, text: {
      en: 'Load the simulation and press play, then jump to the first busy check. The line gives the level it measured, the threshold it was compared against, and what follows: the device skips the rest of the block.',
      zh: '载入仿真、按下播放，然后跳到第一次判忙。那一行写着它量到的电平、用来比对的门限，以及随之而来的结果：这台设备把这个块剩下的部分全跳过了。',
    } },
    { heading: { en: 'A check that only asks who is talking', zh: '只问“此刻谁在发”的检测' }, text: {
      en: 'The phone is a metre and a half from the router and a few paces from the laptop, which is uploading flat out. At that range anything either of them sends lands far above the threshold. So the check has stopped being about distance: almost every time it runs, it answers that somebody is talking.',
      zh: '手机离路由器一米半，离那台正满负荷上传的笔记本也不过几步。在这样的距离上，它们俩不论发什么，落到手机这里都远高于门限。于是这项检测已经和距离无关了：几乎每跑一次，它给出的答案都是“有人在说话”。',
    } },
    { heading: { en: 'One refusal costs a block, not a message', zh: '一次“不许发”赔上的是一个块' }, text: {
      en: 'And a refusal is not a deferral. The device does not wait and try again: it stops its own narrowband transmissions for the rest of the ranging block. With no poll there is no round, so the block’s later rounds still run on the grid — the anchors turn up and wait — and the phone says nothing in any of them.',
      zh: '而且“不许发”并不是一次退避。设备不会稍等片刻再试：它在本测距块余下的时间里，索性不再发出任何窄带帧。没有 Poll 就没有一轮对话，于是这个块后面几轮照样按格子跑——锚点们按时到场、干等着——而手机在每一轮里都一声不吭。',
    } },
    { heading: { en: 'Hopping averages; it does not avoid', zh: '跳变是在平均，不是在躲开' }, text: {
      en: 'One obvious cure is not to sit still: give the session a short list of the control channels it may use — an allow list — and let it change channel from one block to the next, which is a hop. Half that list here lies clear of the router. The session gets back the share of blocks the hop happens to put somewhere quiet, and loses the rest — the choice holds for a whole block, so a block is either whole or gone.',
      zh: '一个显而易见的办法是别老待在原地：给会话一张单子，上面写着它可以用的那几个控制信道——这就是允许列表——再让它一个块一个块地换用其中另一个，这一换就叫跳变。这里列表的一半是避开路由器的。于是会话拿回的，正是“跳变恰好把块丢到清静处”的那个比例，其余照赔——因为这个选择在整块之内不变，一个块要么完整，要么全没。',
    } },
    { heading: { en: 'Where a control channel belongs', zh: '控制信道该放在哪里' }, text: {
      en: 'The other side of the bargain is uncomfortable: switch the rule off and the session works again, at the Wi-Fi link’s expense. The polite configuration is the useless one, and only a regulator decides which you may ship. Hence the real lesson: a control channel does not need the band Wi-Fi is in. It needs a thin slice nobody wants, and there are hundreds.',
      zh: '这笔交易的另一面并不好看：把规则关掉，会话立刻又能干活，代价由 Wi-Fi 链路来付。守规矩的那套配置恰恰是没用的那套，而你能出货哪一套，只有监管说了算。真正的教训因此在这儿：控制信道根本不必待在 Wi-Fi 所在的频段里，它要的只是一薄片没人要的频谱——而这样的薄片有好几百。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'The threshold, and the channel it applies to', zh: '门限，以及它针对的那条信道' }, text: {
      en: 'threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm',
      zh: 'threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm',
    }, note: {
      en: 'A narrowband channel is 2.5 MHz wide and the rule is written per megahertz, so the level a device compares against is −71.02 dBm, assessed for at least 9 µs before each transmission.',
      zh: '一个窄带信道宽 2.5 MHz，而规则是按每兆赫写的，所以设备真正拿来比对的电平是 −71.02 dBm；每次发射之前至少评估 9 µs。',
    } },
    { kind: 'table', heading: { en: 'What the phone hears while it listens', zh: '手机在“听”的时候听到了什么' }, head: [
      { en: 'Source', zh: '来源' }, { en: 'Level at the phone', zh: '手机处的电平' },
      { en: 'Against −71.02 dBm', zh: '与 −71.02 dBm 相比' },
    ], rows: [
      [{ en: 'the router’s 80 MHz burst, 1.50 m off', zh: '路由器的 80 MHz 猝发，相距 1.50 m' }, N('−48.23 dBm'), N('22.8 dB over')],
      [{ en: 'the router’s 20 MHz control frames', zh: '路由器的 20 MHz 控制帧' }, N('−42.21 dBm'), N('28.8 dB over')],
      [{ en: 'the laptop at 15 dBm, 3.35 m off', zh: '以 15 dBm 发射的笔记本，相距 3.35 m' }, N('−63.72 dBm'), N('7.3 dB over')],
    ] },
    { text: {
      en: 'Every one of the phone’s seven busy checks reads −63.72 dBm: the laptop, uploading, three paces away. Seven blocks, seven checks, seven skipped, and one anchor loses two blocks to checks of its own as well.',
      zh: '手机那七次判忙，每一次读到的都是 −63.72 dBm：三步之外那台正在上传的笔记本。七个块，七次检测，七个被跳过；另外还有一个锚点，也因自己的两次判忙赔掉两个块。',
    } },
    { kind: 'table', heading: { en: 'Four ways to place one control channel', zh: '同一个控制信道的四种放法' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'Narrowband channel', zh: '窄带信道' },
      { en: 'Blocks skipped', zh: '跳过的块' }, { en: 'Phone ranges', zh: '手机测距' },
      { en: 'Fixes', zh: '定位' },
    ], rows: [
      [{ en: 'Inside the router’s channel', zh: '落在路由器的信道之内' }, N('200 · 6301.25 MHz'), N('7 of 7'), N('4'), N('0')],
      [{ en: 'Outside it', zh: '避开它' }, N('100 · 6051.25 MHz'), N('0'), N('28'), N('7')],
      [{ en: 'Hopping over four', zh: '在四个信道间跳变' }, N('100 / 150 / 200 / 210'), N('4 of 7'), N('13'), N('3')],
      [{ en: 'Inside it, no listening', zh: '落在之内，且不先听' }, N('200 · 6301.25 MHz'), N('0'), N('21'), N('5')],
    ] },
    { text: {
      en: 'Two blocks in seven get anything out: their polls left at the one instant the channel happened to be clear. Four distances between them, and still no position, because a position needs three in one block.',
      zh: '七个块里只有两个有所收获：它们的 Poll 恰好赶在信道空闲的那一瞬发了出去。两个块合起来给出四个距离，却依然解不出定位，因为解一个定位要同一个块里的三个距离。',
    } },
    { heading: { en: 'The other direction', zh: '反过来的那一侧' }, text: {
      en: 'The narrowband radio is far from harmless in the other direction. Its 10 dBm all sits inside one 2.5 MHz channel, and that reaches Wi-Fi’s energy-detect threshold 15.07 m away — longer than this room. Every control message here is audible to every Wi-Fi radio in it.',
      zh: '反过来看，这部窄带射频也远称不上无害。它那 10 dBm 全挤在一个 2.5 MHz 的信道里，按此推算，它在 15.07 m 外仍够得着 Wi-Fi 的能量检测门限——比这个房间还长。于是这里发出的每一条控制消息，屋里每一台 Wi-Fi 收发机都听得见。',
    } },
    { text: {
      en: 'Listening does not make a message harmless, only rarer. With the rule on, ten of them reach the air and six Wi-Fi frames fail behind them; with it off, 108 messages and 87 failures.',
      zh: '“先听”并不能让一条消息变得无害，它只是让这样的消息变少。规则开着时，只有十条上了空口，其后有六个 Wi-Fi 帧解不出来；关掉之后，是 108 条消息与 87 次失败。',
    } },
    { heading: { en: 'Who pays the difference', zh: '差额由谁来付' }, text: {
      en: 'The laptop pays. Its throughput falls from 407.215 Mb/s to 362.631, which is 44.58 Mb/s gone, or 10.95 % of what it had — the price of a session that works.',
      zh: '付账的是笔记本。它的吞吐从 407.215 Mb/s 掉到 362.631 Mb/s，少掉 44.58 Mb/s，占它原有吞吐的 10.95 %——这就是“会话能干活”的标价。',
    } },
    { kind: 'steps', heading: { en: 'One busy check, step by step', zh: '一次判忙，一步一步来' }, items: [
      { en: 'Before every narrowband message the device asks whether this channel obliges it to listen at all: in the upper of the two bands it must, in the lower one it need not.',
        zh: '每发一条窄带消息之前，设备先问一句：这条信道要不要求我先听？两个频段里，上面那个要求，下面那个不要求。' },
      { en: 'If it must, it reads the power already sitting in that channel’s 2.5 MHz — one instantaneous reading, standing in for the assessment window the rule asks for.',
        zh: '若要求，它就读一下这条信道那 2.5 MHz 里已经有多少功率——这里只读一个瞬时值，代替规则要求的那段评估时间。' },
      { en: 'It compares the reading with the threshold, which is the limit written per megahertz spread over the channel’s own width. Below it the message goes out; at it or above, the channel counts as busy.',
        zh: '它把这个读数与门限相比，而门限就是那条“每兆赫多少”的限值摊到整条信道的宽度上。低于门限就发；等于或高于，这条信道就算忙。' },
      { en: 'A busy reading is not a back-off. The device marks the whole ranging block and sends no narrowband message at all for the rest of it.',
        zh: '判忙并不是一次退避。设备会把整个测距块记下，在这个块余下的时间里，一条窄带消息也不发。' },
      { en: 'With no Poll there is no round. The anchors go on turning up in their slots, wait, and time out, and the block ends with nothing measured.',
        zh: '没有 Poll 就没有一轮。锚点照样按时出现在自己的时隙里，干等，然后超时；这个块就这样在什么也没量到的情况下结束。' },
      { en: 'The next block draws its channel from the allow list again, so a session that hops gets back exactly the share of blocks the draw puts somewhere quiet.',
        zh: '下一个块会重新从允许列表里抽一条信道，所以会跳变的会话，拿回的恰好是“抽签把块丢到清静处”的那个比例。' },
    ] },
    { kind: 'table', heading: { en: 'The six steps, on this scene', zh: '这六步，落在本场景上' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'This scene', zh: '本场景' },
    ], rows: [
      [{ en: 'The channel, and it does oblige', zh: '信道，而且它确实要求先听' }, N('200 · 6301.25 MHz')],
      [{ en: 'The threshold it compares against', zh: '拿来比对的门限' }, N('−75 dBm/MHz + 10·log10(2.5) = −71.02 dBm')],
      [{ en: 'What the phone reads', zh: '手机读到的' }, N('−63.72 dBm')],
      [{ en: 'Reading against threshold: busy', zh: '读数对门限：忙' }, N('−63.72 ≥ −71.02 dBm')],
      [{ en: 'Blocks skipped, of seven', zh: '七个块里被跳过的' }, N('7')],
      [{ en: 'Ranges, and fixes', zh: '测距数，与定位数' }, N('4 · 0')],
      [{ en: 'What the laptop pays', zh: '笔记本付的账' }, N('407.215 → 362.631 Mb/s · −44.58 · 10.95 %')],
    ] },
  ],
  deeper: [
    { kind: 'formula', heading: { en: 'How far the check can see', zh: '这项检测能看多远' }, text: {
      en: '20 dBm over 80 MHz → 20 + 10·log10(2.5 / 80) = 4.95 dBm inside one narrowband channel\n4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m',
      zh: '20 dBm 摊在 80 MHz 上 → 20 + 10·log10(2.5 / 80) = 4.95 dBm 落在一个窄带信道内\n4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m',
    }, note: {
      en: 'Arithmetic, not a measurement: an 80 MHz transmission at 20 dBm puts 4.95 dBm into any 2.5 MHz slice of itself, and under the Wi-Fi link’s own indoor law it crosses the threshold 8.62 m out. The phone is 1.50 m from the router, well inside that radius, which is why its answer never changes.',
      zh: '这是算术，不是测量：20 dBm 的 80 MHz 发射，在自己带内任意 2.5 MHz 的一片里都是 4.95 dBm；按 Wi-Fi 链路自己的室内传播律，它在 8.62 m 处跨过门限。手机离路由器 1.50 m，稳稳落在这个半径之内——这就是它的答案从不改变的原因。',
    } },
    { heading: { en: 'The hop, block by block', zh: '逐块看那次跳变' }, text: {
      en: 'The allow list [100, 150, 200, 210] holds two channels clear of the router’s 80 MHz and two inside it — 6326.25 MHz is inside too. Block b takes list[hash(“7:b”) mod 4], which gives 100, 210, 200, 150, 100, 210, 200 over the seven blocks. Blocks 0, 3 and 4 land outside and run in full; 1, 2, 5 and 6 land inside and are skipped, though block 5 gets one distance out before its report slot is stopped. Three fixes instead of seven: hopping buys exactly the share of blocks the hash puts somewhere quiet.',
      zh: '允许列表 [100, 150, 200, 210] 里有两个信道避开了路由器的 80 MHz，另两个落在里面——6326.25 MHz 同样在里面。第 b 块取 list[hash(“7:b”) mod 4]，在这七个块上依次给出 100、210、200、150、100、210、200。第 0、3、4 块落在外面，完整跑完；第 1、2、5、6 块落在里面，被跳过，其中第 5 块在报告时隙被拦下之前还发出了一个距离。七次定位变成三次：跳变买到的，恰好是散列把多少个块丢到清静处的那个比例。',
    } },
    { heading: { en: 'Counting what Wi-Fi gives up', zh: '数一数 Wi-Fi 让出了多少' }, text: {
      en: 'No record names the emitter that made a Wi-Fi radio defer, so count instead the clear-channel transitions that go busy on energy alone while a narrowband message is on the air: 44 in 1.3 seconds with the rule off, against none in the scene where the control channel sits outside. Not 108 twice over — a radio already busy, or already transmitting, makes no new transition. This radio is a different animal from the wideband one next door: a ranging frame’s −14 dBm, spread over 499.2 MHz, only trips the same threshold within about 40 cm. The model’s simplification shows the other way too: one reading at the slot start says nothing about the 576 µs that follow, so a Wi-Fi frame beginning during a control message lands on it anyway.',
      zh: '没有哪条记录会写明“是谁害得这台 Wi-Fi 收发机退让”，所以改数另一件事：落在某条窄带消息期间、且仅因能量而转为“忙”的 CCA 跳变——关掉规则后，1.3 秒里 44 次；而在控制信道避开路由器的那个场景里，一次也没有。它不是 108 的两倍：本来就忙着、或者正在发的收发机，根本不会再跳一次。这部射频和隔壁那部宽带射频完全是两回事：一帧测距帧的 −14 dBm 摊在 499.2 MHz 上，只在约 40 cm 以内才碰得到同一个门限。模型的简化在另一个方向上也露了馅：时隙开头的一次功率读数，对随后的 576 µs 什么也没说，于是在一条控制消息中途开始的那个 Wi-Fi 帧，照样撞了上去。',
    } },
    { heading: { en: 'What comes back the other way', zh: '反方向飞回来的东西' }, text: {
      en: 'With the rule off, seven narrowband messages die at the phone — five reports and two responses — every one of them under the router’s own 20 MHz control frame, arriving at −42.21 dBm from 1.50 m away. The first reads “uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”. A control message has no margin to spend: its receiver bottoms out at −100 dBm, so foreign power reaching its own level is enough.',
      zh: '把规则关掉，有七条窄带消息死在手机这里——五条 Report、两条 Response——每一条都倒在路由器自己那帧 20 MHz 控制帧之下：它从 1.50 m 外飞来，到达时 −42.21 dBm。头一条写着 “uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”。一条控制消息没有余量可花：它的接收端到 −100 dBm 就见了底，外来功率只要追平它自己的电平，就够了。',
    } },
    { heading: { en: 'Where the default allow list points', zh: '默认的允许列表指向哪里' }, text: {
      en: 'The plan holds 250 channels of 2.5 MHz: 50 in UNII-3 from 5726.25 MHz up, and 200 in UNII-5 — the 6 GHz Wi-Fi band — from 5926.25 MHz up. One 20 MHz Wi-Fi channel covers eight of them, and this router’s 80 MHz wholly contains thirty-two, numbers 186 to 217. The allow list a session ships with by default is [3] — 5733.75 MHz, in UNII-3, below the whole 6 GHz Wi-Fi band and out of reach of any channel in it, where listening first is optional. Channel 100, the “outside” scene, is a weaker version of the same idea: still in UNII-5, still subject to the rule, but with 212.5 MHz of empty spectrum between its upper edge and the router’s lower one, so the rule never finds anything to stop.',
      zh: '整套规划共有 250 个 2.5 MHz 的信道：UNII-3 里 50 个，自 5726.25 MHz 起；UNII-5——也就是 6 GHz Wi-Fi 频段——里 200 个，自 5926.25 MHz 起。一条 20 MHz 的 Wi-Fi 信道能盖住其中八个，而这台路由器的 80 MHz 整整包住三十二个，编号 186 到 217。一个会话自带的默认允许列表是 [3]——5733.75 MHz，位于 UNII-3，落在整个 6 GHz Wi-Fi 频段之下，那里任何 Wi-Fi 信道都够不着，先听后发在那里也是可选的。“避开路由器的信道”所用的 100 号，是同一个主意的弱化版：它仍在 UNII-5，仍受这条规则管，只是其上边沿与路由器的下边沿之间隔着 212.5 MHz 的空白频谱，于是规则从来没有什么可拦的。',
    } },
  ],
  sources: [
    { en: 'One layer here is regulation: the −75 dBm/MHz energy-detection threshold and the 9 µs assessment come from the ETSI EN 303 687 rules for frame-based equipment, which P802.15.4ab adopts for its narrowband channels in UNII-5.',
      zh: '本课有一层来自法规：−75 dBm/MHz 的能量检测门限与至少 9 µs 的评估时间，出自 ETSI EN 303 687 对“基于帧的设备”的规定，P802.15.4ab 把它用在自己位于 UNII-5 的窄带信道上。' },
    { en: 'The 250 narrowband channels, the listen-before-talk rule with its whole-block discontinuation, and the block-wise hop are all P802.15.4ab, at D5.0 in Sponsor-ballot recirculation in September 2026. That draft is members-only, so this is paraphrased from TG4ab contributions 15-22/0381r5 (channels, LBT, the hop) and 15-23/0100r2 (the channel counts). The balloted draft may differ.',
      zh: '250 个窄带信道、带“整块中止”后果的先听后发规则、以及按块跳变，都来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票再循环阶段，版本 D5.0。该草案仅对会员开放，所以这里改写自 TG4ab 的两篇提案文稿：15-22/0381r5（信道规划、先听后发与跳变）与 15-23/0100r2（信道数目）。已投票的草案可能与之不同。' },
    { en: 'Model choices: the channel-centre formula is reconstructed from the published channel counts and band edges; the block-wise hop uses the simulator’s own string hash where the draft specifies AES-128-CTR keyed by the session seed; and one instantaneous power reading stands in for the 9 µs assessment.',
      zh: '以下是模型取值：信道中心频率的公式，是依据已公开的信道数目与频段边界反推出来的；按块跳变用的是仿真器自己的字符串散列，而草案规定的是以会话种子为密钥的 AES-128-CTR；草案要求至少评估 9 µs，这里以一次瞬时功率读数代之。' },
    { en: 'The two path-loss laws are the model’s and each emission keeps its transmitter’s own: Wi-Fi under the indoor exponent 3 — 46.7 dB at one metre, plus 30·log10 d, plus 1.2 dB for 6 GHz — and the narrowband radio under free space, 48.44 dB at one metre on channel 200. The −62 dBm energy-detect threshold and the 6 GHz channel numbering are the model’s too.',
      zh: '两条路径损耗公式都是模型的，而且每一路发射都沿用自己发射端的那一条：Wi-Fi 按室内衰减指数 3 传播——一米处 46.7 dB，加 30·log10 d，6 GHz 再加 1.2 dB；窄带射频按自由空间传播，200 号信道一米处 48.44 dB。−62 dBm 的能量检测门限与 6 GHz 的信道编号，同样属于模型。' },
  ],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: { en: 'Outside the router’s channel', zh: '避开路由器的信道' }, scenario: () => uwbNbaScenario('outside') },
    { label: { en: 'Hop over four channels', zh: '在四个信道间跳变' }, scenario: () => uwbNbaScenario('hop') },
    { label: { en: 'No LBT', zh: '不先听后发' }, scenario: () => uwbNbaScenario('noLbt') },
    { label: { en: 'One anchor at a time', zh: '一次只问一个锚点' }, scenario: () => uwbNbaScenario('pairwise') },
  ],
  jumps: [
    J('the busy check that ends the block', '终结这个块的那次“忙”检测', firstNbLbt),
    J('the narrowband poll that did get out', '唯一发得出去的那帧窄带 Poll', firstNbPoll),
    J('the first distance the run gets out', '整段运行里第一个发得出去的距离', firstUwbRange),
  ],
  observe: [
    { en: 'At 21.000 ms the phone’s own report slot: “uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”. Nothing of the phone’s is heard again for the rest of that block.',
      zh: '21.000 ms 处轮到手机自己的报告时隙：“uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”。此后直到这个块结束，空口上再也听不到手机。' },
    { en: 'The anchors say what that silence costs: “anchor-1 UWB slot 42: no nb-report from uwb-1”, and in the next block “anchor-1 UWB slot 0: no nb-poll from uwb-1”. The grid runs on without it.',
      zh: '锚点们替这段沉默开出了账单：“anchor-1 UWB slot 42: no nb-report from uwb-1”，到了下一个块又是 “anchor-1 UWB slot 0: no nb-poll from uwb-1”。格子照样往下跑，只是少了它。' },
    { en: 'The phone’s inspector reads “200 · 6301.25 MHz” and, under listen before talk, “7 busy · 7 blocks skipped”. Its fragment rows are untouched, and there are 21 timeouts against four distances.',
      zh: '手机的检视面板上写着 “200 · 6301.25 MHz”，而“先听后发”一行是 “7 次忙 · 跳过 7 个块”。它那几行片段纹丝不动，而超时有 21 次，测出的距离只有四个。' },
  ],
  tryThis: [
    { en: 'Load each of the other three scenes in turn. “Outside the router’s channel”: not one busy check, 28 distances, a fix in every block, and a Wi-Fi side identical to a run with no ranging session. “Hop over four channels”: three blocks clear, three fixes. “No LBT”: 21 distances, 5 fixes, and control messages dying at the phone instead.',
      zh: '把其余三个场景依次载入。“避开路由器的信道”：一次判忙也没有，28 个距离，每个块都解出定位，而 Wi-Fi 这一侧与完全没有测距会话的那次运行毫无差别。“在四个信道间跳变”：三个块落到清静处，给出三次定位。“不先听后发”：21 个距离、5 次定位，而这回改成控制消息死在手机这里。' },
  ],
  quiz: [
    {
      q: { en: 'The phone is 1.50 m from the router and its fragments clear the receiver by 34.5 dB. Why does the base scene get four distances in seven blocks?', zh: '手机离路由器只有 1.50 m，它的片段还高出接收门限 34.5 dB。为什么基础场景七个块里只拿到四个距离？' },
      options: [
        { en: 'The fragments are buried by the router’s bursts', zh: '片段被路由器的猝发压住了' },
        { en: 'Listen before talk is an energy test, not a margin test: the laptop alone reads −63.72 dBm at the phone, and one busy check costs the whole block', zh: '先听后发测的是能量，不是余量：光是那台笔记本在手机处就有 −63.72 dBm，而一次判忙要赔上整整一个块' },
        { en: 'The narrowband receiver is below its sensitivity at that range', zh: '在那个距离上窄带接收机低于自己的灵敏度' },
      ],
      answer: 1,
      explain: { en: 'Both links are excellent here; what fails is a rule. Seven blocks, seven checks at −63.72 dBm, seven skipped — and the two that got a poll out first gave two distances each, never a fix’s three.', zh: '两条链路在这里都好得很，失败的是一条规则。七个块，七次读到 −63.72 dBm 的检测，七个块被跳过——而那两个赶在判忙之前把 Poll 发出去的块，各自也只给出两个距离，凑不齐解一次定位所需的三个。' },
    },
    {
      q: { en: 'With the rule off the session gets 21 distances instead of four. What did that cost the Wi-Fi link?', zh: '关掉规则之后，会话拿到的是 21 个距离，而不是四个。这让 Wi-Fi 链路付出了什么？' },
      options: [
        { en: 'Nothing measurable — 10 dBm is far below the energy-detect threshold', zh: '没有可测的代价——10 dBm 远低于能量检测门限' },
        { en: '87 failed frames and 10.95 % of the laptop’s throughput: 362.631 Mb/s against 407.215', zh: '87 个帧解调失败，以及笔记本吞吐的 10.95 %：362.631 Mb/s 对 407.215 Mb/s' },
        { en: 'Only deferrals: the link loses time, but no frame is lost', zh: '只是退避：链路损失了时间，但没有帧丢失' },
      ],
      answer: 1,
      explain: { en: '10 dBm inside 2.5 MHz reaches the threshold 15.07 m out, further than this room is long. Listening changes how many messages there are, not what each one does.', zh: '2.5 MHz 里的 10 dBm 到 15.07 m 处仍够得着门限，比这个房间还远。先听改变的是消息的条数，而不是每条消息造成的后果。' },
    },
  ],
}
