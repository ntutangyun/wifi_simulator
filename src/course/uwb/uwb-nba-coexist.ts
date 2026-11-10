/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · The narrowband radio shares 6 GHz too.
 *
 * In the standard-first shape (2026-11-10). ① sets out, document by document, what governs a
 * narrowband transmission in the 6 GHz band: the channel plan and block-wise hopping of the TG4ab
 * proposal 15-22/0381r5; that proposal's own listen-before-talk (≥ 9 µs CCA at −75 dBm/MHz, after
 * ETSI EN 303 687, and a busy channel skipping the rest of the ranging block); the draft's later
 * §10.39.8.3 as the comment resolutions 15-25/0307r1 and 15-25/0427r4 rewrote it (only where
 * regulation requires it, and then CSMA-CA or SSBD per transmit slot); the D04 comments that asked
 * for more and did not get it (15-26/0244r1, motion failed 25/14/1 in 15-26/0348r1); and the
 * primary-20 MHz energy detect of IEEE Std 802.11-2024 §27.3.22.6.3. ② marks the engine's
 * departures as such — the per-block skip and UNII-5-always rule (audit #19), the instantaneous
 * reading (#20), the whole-width Wi-Fi comparison (#21): W5/W6 have not fixed them yet. ③ runs the
 * four control-channel settings.
 *
 * It loads exactly the scene `uwb-nba` loads. Every figure the labs print is read back out of the
 * lesson and compared with a run in tests/course/uwb-nba-coexist.test.ts.
 */
import { J, firstNbLbt, firstNbPoll, type Lesson } from '../lessonKit'
import { uwbNbaScenario } from './uwb-nba'

export const uwbNbaCoexist: Lesson = {
  id: 'uwb-nba-coexist',
  module: 29,
  title: '窄带射频也共享 6 GHz',
  why: 'P802.15.4ab 草案把窄带（narrowband, NB）控制信道放在 UNII-3 与 UNII-5 两个频段，后者就是 6 GHz 的 Wi-Fi 频段。是否先听后发（listen before talk, LBT），各份文稿的说法不同：早期提案 15-22/0381r5 要求在 UNII-5 一律执行，每次发送前至少评估 9 µs，能量高于 −75 dBm/MHz 就不发送，并在这个测距块（ranging block）余下的时间里不再发送；草案后来的 §10.39.8.3 改为只在法规要求时执行，执行时由收发两端在每个发射时隙上各自用 CSMA-CA 或频谱感知延后做一次信道接入。本仿真器目前仍按早期提案的做法：UNII-5 一律执行，一次瞬时读数判忙就跳过整个块——这是待改正的偏差。本课的场景里手机离一台 Wi-Fi 7 路由器 1.5 m，几步之外有一台笔记本满负荷上传；超宽带（ultra-wideband, UWB）一侧的余量超过 30 dB，可是手机在七个块里每块都判忙一次，整段 1.3 秒一个距离也没有测得，一次定位也没有。把控制信道移出路由器的 80 MHz，每块都能定位；在四个信道间跳变（channel hopping），恢复的正好是落在路由器信道之外的那几个块；关掉先听后发，手机仍然得到 0 个距离：它要接收的窄带消息有 28 条与路由器发出的块确认（block acknowledgement, BlockAck）或允许发送（clear to send, CTS）帧重叠（overlap）而丢失，代价同时转给 Wi-Fi：笔记本的吞吐下降 7.22 %。',
  outcomes: [
    '分清早期提案、现行草案与法规各自对先听后发的要求，以及本仿真器按的是哪一种',
    '解释在本仿真器的规则下，为什么一次判忙损失的是整个测距块',
    '比较迁移控制信道、跳变与关闭先听后发三种做法的结果与代价',
  ],
  needs: ['uwb-nba', 'uwb-coexist'],
  terms: [
    { term: 'LBT', plain: '先听后发：发送之前先测量信道，若信道已被占用就不发送' },
    { term: 'threshold', plain: '门限：一次读数要与之比较的那个电平——高于它判为信道忙，低于它判为空闲' },
    { term: 'allow list', plain: '一个会话获准使用的那一小组控制信道' },
    { term: 'hop', plain: '按一条两端都能自行算出的规则，在相邻两个块之间换用允许列表里的另一个信道' },
  ],
  standard: [
    { heading: '信道规划（15-22/0381r5 §1.4、§1.5）', text: '窄带信道宽 2.5 MHz，共 250 个：0–49 号在 UNII-3，50–249 号在 UNII-5。一个会话只使用允许列表（allow list）里的信道，缺省的控制与报告信道允许列表是 3 号信道，位于 UNII-3。' },
    { heading: '按块跳变（15-22/0381r5 §1.5.3）', text: '设备可以在相邻两个测距块之间换用允许列表里的另一个信道。提案用以会话种子为密钥（key）、以测距块的编号为输入的 AES-128 计数器模式作为伪随机生成式，从允许列表里选出每一块的信道；收发两端各自算出同一个结果。现行草案的生成式无法从公开文稿逐字核实。' },
    { heading: '早期提案的先听后发（15-22/0381r5 §1.4.2）', text: '法规要求先听后发，或为了与 802.11 共存而执行时，发射机在发送前进行一次空闲信道评估（clear channel assessment, CCA），至少 9 µs，能量检测门限（energy detection threshold）取 −75 dBm/MHz；这两个数引自 ETSI EN 303 687 对基于帧的设备的规定。信道空闲就在 16 µs 内开始发送；信道被占用，就在当前测距块里不再发送窄带消息。提案还写明：50–249 号信道按法规约束执行；没有法规约束时，0–249 号信道都可以执行。' },
    { heading: '草案后来的写法（§10.39.8.3）', text: '评审中有意见指出 ETSI EN 303 687 已不能再作为符合性推定的依据——欧盟 2025/893 号实施决定已使它对这类设备失效（15-25/0307r1）。经 15-25/0307r1 与 15-25/0427r4 的处置，§10.39.8.3 改为：法规要求先听后发时，收发两端可以在每个发射时隙上各自独立地采用 §6.3.2 的 CSMA-CA 或 §10.45 的频谱感知延后（SSBD），配合 CCA 模式 1 或 3，即使相邻时隙使用同一条信道也是如此；法规不要求时，同样的方法可以用来改善共存。草案正文没有给出能量检测门限的数值。' },
    { heading: '没有写入草案的意见（15-26/0244r1、15-26/0348r1、15-26/0061r0）', text: 'D04 复审中，有意见要求把先听后发改为强制、给出能量检测门限或最短感知时长；评审小组建议否决。采纳这批处置的动议以 25/14/1 未获通过，另一份处置的动议以 17/22/3 未获通过，草案的文字保持不变。更早一轮信函投票中关于 UNII-3、UNII-5 信道接入的同类意见，处置为未能达成修改草案的共识（15-26/0061r0）。' },
    { heading: 'Wi-Fi 一侧的能量检测（energy detection, ED），IEEE Std 802.11-2024 §27.3.22.6.3', text: 'Wi-Fi 接收机的空闲信道评估按主 20 MHz 信道判定：在主 20 MHz 信道内测得的功率达到门限，就报告信道忙。' },
    { kind: 'steps', heading: '一次窄带发送之前，按草案 §10.39.8.3：逐步说明', items: [
      '确定这条信道在当地法规下是否要求先听后发；不要求时可以直接发送，也可以为了共存而执行。',
      '要求时，在这个发射时隙上选用 CSMA-CA 或 SSBD，配合 CCA 模式 1 或 3。',
      '收发两端各自独立执行，每个发射时隙执行一次，不因前一个时隙用过同一条信道而省略。',
      '信道接入成功就发送；不成功时怎样处理，由所选的那种信道接入方法规定（SSBD 见下一课）。',
    ] },
  ],
  implementation: [
    { topic: '信道规划', standard: '250 个 2.5 MHz 信道，UNII-3 50 个，UNII-5 200 个（15-22/0381r5）', sim: '照此编号；各信道的中心频率是本仿真器按信道数与频段边沿反推的：200 号 6301.25 MHz，100 号 6051.25 MHz。', kind: 'choice' },
    { topic: '允许列表', standard: '缺省为 3 号信道（15-22/0381r5）', sim: '本课的基准场景用 200 号，落在路由器的 80 MHz 之内；三个变体分别为 100 号、[100, 150, 200, 210] 与 200 号。', kind: 'value' },
    { topic: '跳变的生成式', standard: '以会话种子为密钥的 AES-128 计数器模式（15-22/0381r5 §1.5.3）', sim: '用本仿真器自己的字符串散列代替；同一张允许列表因此给出另一串信道。', kind: 'differs' },
    { topic: '何时执行先听后发', standard: '草案：只在法规要求时（§10.39.8.3）', sim: '按早期提案：UNII-5（50 号及以上）一律执行，UNII-3 不执行；场景可以强制打开或关闭。这是待改正的偏差。', kind: 'differs' },
    { topic: '判忙之后', standard: '草案：每个发射时隙各自做一次 CSMA-CA 或 SSBD（§10.39.8.3）', sim: '按早期提案 §1.4.2：在这个测距块余下的时间里不再发送任何窄带消息。这是待改正的偏差。', kind: 'differs' },
    { topic: '感知时长', standard: '早期提案与 ETSI：至少 9 µs', sim: '只读一个瞬时功率值，不在任何时长上积分。这是待改正的偏差。', kind: 'differs' },
    { topic: '门限', standard: '草案未给出；早期提案引 ETSI 的 −75 dBm/MHz', sim: '取 −75 dBm/MHz，换算到整条 2.5 MHz 信道为 −71.02 dBm（换算是本仿真器的读法）。', kind: 'value' },
    { topic: '读数里有什么', standard: '能量检测不区分来源', sim: '只计入 Wi-Fi 一侧正在发射的功率；别的超宽带设备、别的窄带会话与噪声地板（noise floor）都不计入。', kind: 'choice' },
    { topic: '窄带对 Wi-Fi 的影响', standard: '标准不规定发射频谱的形状', sim: '10 dBm 均匀分布在 2.5 MHz 内的矩形，没有频谱模板与旁瓣；Wi-Fi 接收机也没有选择性。', kind: 'choice' },
    { topic: 'Wi-Fi 的能量检测', standard: '按主 20 MHz 信道判定（802.11-2024 §27.3.22.6.3）', sim: '把 −62 dBm 与整条信道宽度里的外来功率比较，不区分主 20 MHz。这是待改正的偏差。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '一次判忙，损失一个块',
      jump: 0,
      steps: [
        '载入本课场景，跳到终止这个块的那次判忙。',
        '读出测得的电平与门限，再看这个块余下的时隙里谁还在发送。',
      ],
      expect: '第一次判忙是 2.000 ms 的「anchor-2 NB LBT busy on ch 200: -69.6 dBm ≥ -71.0 — skipping the block」。手机自己在七个块里各判忙一次，七次读到的都是 −63.72 dBm，比门限高 7.3 dB；七个块全部被跳过，空着的时隙里共记下 25 次超时。',
      meaning: '判忙后跳过整个块与一次瞬时读数，都是本仿真器按早期提案的做法，与现行草案不同（②）。',
    },
    {
      heading: '控制信道的四种配置',
      more: [0, 1, 2],
      steps: [
        '依次载入本课场景、「避开路由器的信道」「在四个信道间跳变」与「不先听后发」，各运行 1.3 秒。',
        '对照下表读出手机跳过的块数、测得的距离与定位次数。',
      ],
      blocks: [
        { kind: 'table', heading: '控制信道的四种配置', head: ['场景', '窄带信道', '手机跳过的块', '手机测距', '定位'], rows: [
          ['落在路由器的信道之内', '200 · 6301.25 MHz', '7 of 7', '0', '0'],
          ['避开路由器的信道', '100 · 6051.25 MHz', '0', '28', '7'],
          ['在四个信道间跳变', '100 / 150 / 200 / 210', '4 of 7', '13', '3'],
          ['落在之内，且不执行先听后发', '200 · 6301.25 MHz', '0', '0', '0'],
        ] },
      ],
      expect: '控制信道移到 100 号，一次判忙也没有，七个块都解出定位；跳变恢复了三个块；关掉先听后发，手机一次也没有判忙，却仍然只得到 0 个距离、0 次定位，原因见下面「关掉先听后发，代价转给 Wi-Fi」那一节。基准场景是三个锚点（anchor）的一对多轮次，三个变体是四个锚点的成对轮次。',
      meaning: '控制信道不必放在 Wi-Fi 所在的频段里；在本仿真器的规则下，一个块要么完整完成，要么完全失败（②）。',
    },
    {
      heading: '逐块看跳变',
      variant: 1,
      steps: [
        '载入「在四个信道间跳变」，逐块读出这一块用的窄带信道。',
        '对照哪些块判忙、哪些块解出定位。',
      ],
      expect: '七个块依次用 100、210、200、150、100、210、200 号信道；第 1、2、5、6 块落在路由器的 80 MHz 之内，手机判忙；第 0、3、4 块在外，各解出一次定位。',
      meaning: '这串信道来自本仿真器自己的散列（②）；换成提案的生成式会得到另一串，但「恢复的正好是落在信道之外的那几个块」这一结论不变。',
    },
    {
      heading: '关掉先听后发，代价转给 Wi-Fi',
      variant: 2,
      more: [0],
      steps: [
        '载入「不先听后发」，统计窄带消息的条数与 Wi-Fi 一侧接收失败的帧数。',
        '再载入「避开路由器的信道」，读出笔记本的吞吐作为对照。',
      ],
      blocks: [
        { kind: 'table', heading: '规则开与关，Wi-Fi 一侧的变化', head: ['场景', '窄带消息', 'Wi-Fi 接收失败'], rows: [
          ['落在之内，执行先听后发', '10', '7'],
          ['落在之内，不执行先听后发', '72', '64'],
        ] },
      ],
      expect: '笔记本的吞吐从 407.215 Mb/s 降到 377.815 Mb/s，减少 29.40 Mb/s，即 7.22 %。反方向的损失更大：手机处有 28 条窄带消息接收失败，每一次都恰逢路由器发出控制帧（control frame），外来功率 −42.21 dBm；手机因此一个距离也没有得到。',
      meaning: '先听后发减少的是窄带消息的条数，而不是每条消息对 Wi-Fi 的影响；这个影响的大小取决于本仿真器的矩形频谱与 Wi-Fi 侧的能量检测方式（②）。',
    },
  ],
  sources: [
    'P802.15.4ab 草案（截至 2026 年 9 月，投票稿为 D05，仍在 Sponsor 投票复审中），仅对会员开放。本课依据 TG4ab 文稿：15-22/0381r5（§1.4 信道规划与先听后发、§1.5.3 按块跳变）、15-25/0307r1 与 15-25/0427r4（§10.39.8.3 的改写，改用 §6.3.2 的 CSMA-CA 或 §10.45 的 SSBD）、15-26/0244r1（D04 复审中关于先听后发的意见与处置建议）、15-26/0348r1（采纳处置的动议以 25/14/1 与 17/22/3 未获通过）、15-26/0061r0（更早一轮信函投票中同类意见的处置）。已投票的 D05 可能与此不同。',
    '法规：ETSI EN 303 687 对基于帧的设备的规定（至少 9 µs 的评估、−75 dBm/MHz 的门限），由 15-22/0381r5 引用；欧盟 2025/893 号实施决定使其不再构成符合性推定，见 15-25/0307r1。',
    'IEEE Std 802.11-2024 §27.3.22.6.3：主 20 MHz 信道上的空闲信道评估。',
    '本仿真器的取值与取法：信道中心频率的反推公式、按块选信道的字符串散列、−71.02 dBm 的换算、一次瞬时读数、只计入 Wi-Fi 功率的读数、窄带发射的矩形频谱、Wi-Fi 能量检测按整条信道宽度比较。与草案不同之处：UNII-5 一律执行先听后发、判忙后跳过整个块。',
  ],
  limits: [],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: '避开路由器的信道', scenario: () => uwbNbaScenario('outside') },
    { label: '在四个信道间跳变', scenario: () => uwbNbaScenario('hop') },
    { label: '不先听后发', scenario: () => uwbNbaScenario('noLbt') },
    { label: '每次只与一个锚点测距', scenario: () => uwbNbaScenario('pairwise') },
  ],
  jumps: [
    J('终止这个块的那次判忙', firstNbLbt),
    J('唯一成功发出的那帧窄带 Poll', firstNbPoll),
    J('窄带消息被 Wi-Fi 干扰而丢失', (r) => r.type === 'UWB_INTERFERED'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按现行草案 §10.39.8.3，窄带发送什么时候必须先听后发？',
      options: [
        '在 UNII-5 频段一律必须',
        '只在法规要求时；那时收发两端在每个发射时隙上各自用 CSMA-CA 或 SSBD 做一次信道接入',
        '从不需要，草案删去了这一节',
      ],
      answer: 1,
      explain: '「UNII-5 一律执行」是早期提案 15-22/0381r5 的写法；经 15-25/0307r1、15-25/0427r4 处置后，草案只在法规要求时才要求。本仿真器目前仍按早期提案。',
    },
    {
      q: '手机离路由器只有 1.50 m，片段（fragment）的余量超过 30 dB。为什么基准场景七个块里一个距离也没有测得？',
      options: [
        '片段受到路由器猝发的干扰而无法解调',
        '每个块里都有一次窄带判忙，而本仿真器的规则让一次判忙跳过整个块',
        '窄带接收机低于自己的灵敏度（sensitivity）',
      ],
      answer: 1,
      explain: '两边的信号质量都很好；起作用的是本仿真器按早期提案实现的「判忙即跳过整个块」，现行草案的做法是每个发射时隙各自接入。',
    },
    {
      q: '关掉先听后发之后，Wi-Fi 一侧付出了什么代价？',
      options: [
        '没有可测的代价',
        '64 个帧接收失败，笔记本的吞吐下降 7.22 %',
        '只是退避（backoff），没有帧丢失',
      ],
      answer: 1,
      explain: '窄带消息从 10 条增加到 72 条，Wi-Fi 接收失败从 7 帧增加到 64 帧；吞吐从 407.215 Mb/s 降到 377.815 Mb/s。',
    },
  ],
}
