/**
 * Wi-Fi Tier 2 · M7 · QoS 与效率 · seven ways to deviate from the EDCA parameters,
 * and the places three of them do nothing at all.
 *
 * Standard-first shape (2026-11-11). This lesson is a deliberate demonstration of NON-standard
 * behaviour, so the shape is used the way the brief asks for such scenes: ① gives the rules a
 * compliant station follows — the parameters the access point advertises (§9.4.2.27, §10.2.3.2,
 * Table 9-194), the AC mapping (Table 10-1), AIFS and the uniform draw (§10.23.2.4), the window
 * update (§10.23.2.2), the TXOP limit (§10.23.2.9) and how a Duration is written and relayed
 * (§9.2.5.2, §9.2.5.6); ② marks each of the seven tamper presets as `differs` and says it is this
 * lesson's deliberate demonstration, next to the faithful rows the cheats are measured against;
 * ③ four runs.
 *
 * One correction from the audit: the old table said the window-collapse preset breaks
 * 「倒数值应在 0 与当前窗口之间均匀抽取」. It does not — the engine still draws uniformly, from
 * [0, 0]. What it breaks is the rule that a station uses the CWmin/CWmax the access point
 * advertises (§10.2.3.2). The standard itself allows an advertised CWmin of 0 (ECWmin = 0, §9.4.2.27).
 *
 * Two measurements are the lesson's subject rather than footnotes: the ladder has four rungs and
 * a ceiling group across seeds 7, 11, 23, 37 and 42 (not seven rungs), and three presets are
 * byte-identical to not cheating in legal scenes (tests/engine/tamper-inert.test.ts).
 *
 * The scene is `tamperScenario()`: three saturated stations, no servers. Every figure the labs
 * print is read back out of this file by tests/course/edca-tamper.test.ts, at 2000 ms unless the
 * lab says otherwise.
 */
import { type Lesson, J, firstCollision } from '../lessonKit'
import { cloudGameScenario, tamperScenario } from '../wifiScenes'

export const edcaTamper: Lesson = {
  id: 'edca-tamper',
  module: 7,
  title: '篡改驱动——七种偏离，以及其中三种不起作用的场合',
  why: 'IEEE Std 802.11-2024 让接入点（access point, AP）在信标（Beacon）的增强型分布式信道接入（enhanced distributed channel access, EDCA）参数集（parameter set）元素里通告四个接入类别（access category, AC）的竞争参数，非接入点的站点（station, STA）必须使用最近收到的那一组：等待的仲裁帧间间隔数（arbitration interframe space number, AIFSN）不得小于 2，倒数值从竞争窗口（contention window, CW）里均匀抽取，失败后按公式放宽窗口，一个传输机会（transmit opportunity, TXOP）不得超过 TXOP 上限（TXOP limit），帧头（MAC header）里的 Duration 只写本次交互还需要的时间。这些规则都由站点自己执行，等待多久、从多宽的范围抽取，在空口上看不到。本课故意让一台站点违反它们，这是本仿真器为演示而设的作弊配置，不是标准行为：七个预设改动的是 AIFSN、竞争窗口、TXOP 上限、Duration、接入类别与窗口放宽六处中的一处或几处。三台站点都持续上传，没有站点作弊时三台各占约三分之一的发送；在五个随机种子上，作弊者的份额排成稳定的四级——窗口不翻倍、缩短静默、霸占信道、提升优先级一级比一级高，最后三种（虚报时长、窗口坍缩、四种合在一起）都使守规站点几乎发不出帧，相互次序随种子变化，只能算作一组。窗口不翻倍反而使碰撞增多，抑制作用最强的几种几乎没有碰撞，所以碰撞少不等于信道运行正常。在隐藏节点（hidden station）的房间里，虚报的时长经由接入点回复的允许发送（clear to send, CTS）抑制了收不到作弊者的那台站点。有三种改法在其他完全合法的场景里不改变记录中的任何一个字节。',
  outcomes: [
    '说出一台守规站点按标准应使用哪些 EDCA 参数，以及每一种篡改违反的是哪一条',
    '读出四级份额上每一级的数值，并说明为什么最后三种只能算作一组',
    '指出三种篡改各在什么场合下不起作用（记录逐字节相同），以及原因',
  ],
  needs: ['edca', 'edca-cost', 'collisions-cw', 'txop'],
  terms: [
    { term: 'tampered driver', plain: '篡改驱动：站点不使用接入点通告的那组参数，自行填写一组对自己更有利的参数' },
    { term: 'TXOP limit', plain: '传输机会上限：一次取得信道之后最多能连续占用多长时间，接入点为四类各通告一个值' },
    { term: 'Duration', plain: '每一帧帧头里宣告「这次交互还需要多长时间」的字段，收到的站点按它保持静默' },
  ],
  standard: [
    { heading: 'EDCA 参数由接入点通告（§9.4.2.27，§10.2.3.2）', text: '在基础结构基本服务集（basic service set, BSS）里，接入点用 EDCA 参数集元素确定竞争策略；站点用最近收到的这一元素更新自己的参数。在服务质量（quality of service, QoS）BSS 里，非接入点站点使用的 EDCA 参数取自这一元素，收到更新后须在一个信标间隔之内更新 dot11EDCATable。元素为每一类给出 AIFSN、最小竞争窗口（minimum contention window, CWmin）、最大竞争窗口（maximum contention window, CWmax）与 TXOP 上限；CWmin 与 CWmax 以指数形式编码，最小可以是 0。' },
    { heading: '默认值（表 9-194，表 17-21）', text: '非接入点站点的默认 AIFSN 为 AC_BK 7、AC_BE 3、AC_VI 2、AC_VO 2；以第 17 章物理层（physical layer, PHY）的 aCWmin = 15、aCWmax = 1023 计，四类的窗口为 15/1023、15/1023、7/15、3/7；TXOP 上限为 2.528、2.528、4.096、2.080 ms。' },
    { heading: '接入类别由优先级决定（§10.2.3.2，表 10-1）', text: '每一帧的发送队列（queue）与接入类别由它的优先级按表 10-1 映射得到；每个接入类别有自己的一套 EDCA 参数与自己的竞争。' },
    { heading: '等待与抽取（§10.23.2.4）', text: '等待的时长是仲裁帧间间隔（arbitration interframe space, AIFS）：AIFS[AC] = AIFSN[AC] × aSlotTime + aSIFSTime。非接入点站点的 AIFSN[AC] 不得小于 2，接入点不得小于 1。调用退避（backoff）过程时，倒数值在 0 到 CW[AC] 之间均匀随机地取整数。' },
    { heading: '失败后放宽窗口（§10.23.2.2）', text: 'TXOP 的第一个 PPDU（PHY protocol data unit）发送失败时，若 QSRC[AC] 小于 dot11ShortRetryLimit，QSRC[AC] 加 1，CW[AC] 取 CWmax[AC] 与 2^QSRC[AC] × (CWmin[AC] + 1) − 1 中较小的一个；否则 QSRC[AC] 归 0，CW[AC] 回到 CWmin[AC]。TXOP 正常结束时 CW[AC] 回到 CWmin[AC]。' },
    { heading: 'TXOP 与 Duration（§10.23.2.9，§9.2.5.2，§9.2.5.6）', text: '持有者应保证 TXOP 不超过这一类的上限。单次保护（single protection）下，请求发送（request to send, RTS）的 Duration 是待发的帧、CTS、确认帧（acknowledgement, ACK）与其间帧间间隔的时长；回应 RTS 的 CTS，Duration 是 RTS 的 Duration 减去一个短帧间间隔（short interframe space, SIFS）与 CTS 自身。所以 RTS 里写多少，接入点的 CTS 就把它减去这一小段之后转述出去。' },
    { kind: 'steps', heading: '一台守规站点的一次竞争，按标准：逐步说明', items: [
      '从接入点通告的 EDCA 参数集元素取得四类的 AIFSN、CWmin、CWmax 与 TXOP 上限（§10.2.3.2）。',
      '按帧的优先级把它放进对应接入类别的队列（表 10-1）。',
      '介质（medium）空闲 AIFS[AC] 之后开始倒数，倒数值在 0 到 CW[AC] 之间均匀抽取（§10.23.2.4）。',
      '倒数到 0 时取得 TXOP，整个 TXOP 不超过上限，Duration 只写本次交互还需要的时间（§10.23.2.9，§9.2.5.2）。',
      '第一个 PPDU 失败就按公式放宽窗口并重新退避；成功结束则窗口回到 CWmin（§10.23.2.2）。',
    ] },
  ],
  implementation: [
    { topic: '参数从哪里来', standard: '接入点在信标的 EDCA 参数集元素里通告，站点用最近收到的一组（§10.2.3.2）', sim: '本仿真器不发送任何管理帧（management frame），没有信标，也没有关联过程；四类参数是一张常量表。作弊者偏离的是一组从未被广播过的参数。', kind: 'absent' },
    { topic: '默认参数', standard: '表 9-194 与表 17-21 的默认值', sim: '照此：AIFSN 7/3/2/2，窗口 15/1023、15/1023、7/15、3/7，TXOP 上限 2.528/2.528/4.096/2.080 ms；SIFS 16 µs、时隙（slot time）9 µs。', kind: 'faithful' },
    { topic: 'AIFS 与抽取', standard: 'AIFS = AIFSN × 时隙 + SIFS；倒数值在 0 到 CW 之间均匀抽取（§10.23.2.4）', sim: '照此。守规站点每一次抽取都落在当时的窗口之内。', kind: 'faithful' },
    { topic: '失败后放宽窗口', standard: 'CW 取 CWmax 与 2^QSRC × (CWmin + 1) − 1 中较小的一个（§10.23.2.2）', sim: '照此：AC_BE 的窗口依次为 15、31、63、127、255、511、1023。', kind: 'faithful' },
    { topic: 'CTS 转述 RTS 的 Duration', standard: 'RTS 的 Duration 减去 SIFS 与 CTS 自身（§9.2.5.6）', sim: '照此。作弊者在 RTS 里多写的时间，接入点的 CTS 原样转述。', kind: 'faithful' },
    { topic: '提升优先级', standard: '接入类别由帧的优先级按表 10-1 映射（§10.2.3.2）', sim: '作弊者把所有帧都放进 AC_VO 的队列，按 AC_VO 的参数竞争。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '缩短静默', standard: '非接入点站点的 AIFSN 不得小于 2；1 只允许接入点使用（§10.23.2.4）', sim: '作弊者的每一类都用 AIFSN = 1。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '窗口坍缩', standard: '使用接入点通告的 CWmin 与 CWmax（§10.2.3.2）', sim: '作弊者的 CWmin = CWmax = 0，仍按 §10.23.2.4 均匀抽取，只是范围只剩 0。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '窗口不翻倍', standard: '失败后按公式放宽窗口（§10.23.2.2）', sim: '作弊者的 CWmax 被钉在 CWmin 上，失败后窗口保持不变。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '霸占信道', standard: 'TXOP 不得超过这一类的上限（§10.23.2.9）', sim: '作弊者的 TXOP 上限一律为 8 000 µs。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '虚报时长', standard: 'Duration 写本次交互实际还需要的时间（§9.2.5.2）', sim: '作弊者发出的 RTS 与数据帧（data frame），Duration 都多加 3 000 µs。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '四种合在一起', standard: '以上各条', sim: '提升优先级、缩短静默、窗口坍缩与霸占信道同时生效。这是本课故意演示的篡改。', kind: 'differs' },
    { topic: '越界的幅度', standard: '标准只规定合规的取值，不涉及违规时越界多少', sim: '8 000 µs 与 3 000 µs 由本仿真器选定，取的是明显越界的值：8 000 µs 约为 AC_VI 上限 4.096 ms 的两倍。换一个幅度，各级的具体份额就会改变。', kind: 'value' },
    { topic: '篡改放在哪里', standard: '标准不涉及', sim: '只能放在非接入点站点上；放在接入点上的篡改，编辑器直接拒绝。在不使用 EDCA 的分布式协调功能（distributed coordination function, DCF）链路（link）上，提升优先级、缩短静默与霸占信道所改的字段不会被读取，编辑器同样拒绝，并指出原因。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '没有站点作弊的房间',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次碰撞，再运行满 2 秒。',
        '在检视器里读出三台站点各自发出的帧数与全场的碰撞次数。',
      ],
      expect: '三台站点分别发出 6 099、7 343、5 967 帧，各自的份额彼此相差不到 8 个百分点；两秒内共碰撞 126 次。',
      meaning: '三台站点使用同一组参数（② 默认参数），「公平」不是精确均分，而是没有哪一台有系统性的优势。这一轮是下面各轮的对照。',
    },
    {
      heading: '七种篡改：四级与一组',
      variant: 0,
      jump: 2,
      more: [1, 2, 3, 4, 5, 6],
      steps: [
        '依次载入七个「作弊」变体，各运行 2 秒，读出作弊者的份额、两台守规站点的帧数与碰撞次数。',
        '在「作弊：窗口坍缩」里跳到作弊者的第一次退避抽取，看它抽到的值。',
        '对照第二张表：同样的七轮换四个随机种子再运行，份额落在什么范围。',
      ],
      blocks: [
        { kind: 'table', heading: '同一个房间，七种篡改各运行两秒（种子 7）', head: ['配置', '作弊者的份额', '守规 A 发出', '守规 B 发出', '碰撞'], rows: [
          ['不作弊', '31.4 %', '7 343', '5 967', '126'],
          ['窗口不翻倍', '41.9 %', '6 555', '3 757', '151'],
          ['缩短静默', '51.7 %', '5 578', '3 472', '119'],
          ['霸占信道', '63.6 %', '3 951', '3 489', '65'],
          ['提升优先级', '95.6 %', '679', '195', '83'],
          ['虚报时长', '99.4 %', '25', '100', '1'],
          ['窗口坍缩', '99.9 %', '25', '0', '20'],
          ['四种合在一起', '100.0 %', '0', '0', '1'],
        ] },
        { kind: 'table', heading: '五个种子（7、11、23、37、42）上作弊者的份额', head: ['配置', '份额的范围'], rows: [
          ['不作弊', '29.4 到 34.1 %'],
          ['窗口不翻倍', '35.3 到 41.9 %'],
          ['缩短静默', '44.5 到 56.5 %'],
          ['霸占信道', '57.7 到 64.5 %'],
          ['提升优先级', '93.1 到 96.6 %'],
          ['虚报时长、窗口坍缩、四种合在一起', '98.6 到 100.0 %'],
        ] },
      ],
      expect: '前五行在每一个种子上都严格递增，五个范围互不重叠；最后三种都在 98.5 % 以上，相互次序随种子变化：种子 7 上虚报时长最轻，种子 23 上窗口坍缩最轻。窗口不翻倍使碰撞从 126 次增加到 151 次；虚报时长与四种合在一起只剩 1 次碰撞。窗口坍缩的作弊者每一次都抽到 0，两秒里发出 19 935 帧，另外两台一共 25 帧。',
      meaning: '每一种篡改都是本课故意演示的偏离（②）。窗口不翻倍的作弊者碰撞后立即以同样小的范围再竞争，多拿到约 10 个百分点，代价是全场多出 25 次碰撞；抑制住所有邻居的作弊者不需要碰撞，所以「几乎没有碰撞」在这里是异常，不是信道正常的标志。',
    },
    {
      heading: '虚报时长经由接入点的 CTS 生效',
      variant: 8,
      more: [7],
      steps: [
        '载入「隐藏节点的房间 + 虚报时长」，运行 300 ms：两台站点隔着两道砖墙，互相收不到，都收得到中间的接入点，帧长超过 RTS 门限（RTS threshold），每次交互都先发 RTS。',
        '点开 Station B 的网络分配向量（network allocation vector, NAV）记录，读出来源与最长的一条；再载入「隐藏节点的房间，不作弊」比较。',
      ],
      expect: 'B 的每一条 NAV 都来自接入点的 CTS，没有一条来自作弊者自己的帧。最长的一条从不作弊时的 2 383.2 µs 变成 5 383.2 µs，恰好多出 3 000 µs；B 被这样抑制的次数从 58 次增加到 116 次。',
      meaning: '作弊者只改了自己 RTS 里的 Duration（② 虚报时长），接入点按 §9.2.5.6 照常转述（② CTS 转述 RTS 的 Duration），于是收不到作弊者的 B 也被抑制。',
    },
    {
      heading: '允许但不起作用：霸占信道遇上只打游戏的手机',
      variant: 9,
      jump: 1,
      steps: [
        '载入「联机游戏的房间 + 霸占信道（不起作用）」，跳到作弊者的第一帧，悬停它的 TXOP 色块，读出截止时刻。',
        '运行 2 秒，与同一个房间不作弊的运行逐条比较记录。',
      ],
      blocks: [
        { kind: 'table', heading: '三种篡改不起作用的场合', head: ['篡改', '场合', '记录'], rows: [
          ['霸占信道', '一台只打游戏的手机独占房间', '只有 TXOP 开始记录的截止时刻不同'],
          ['窗口不翻倍', '同一台手机', '碰撞、确认超时与重传（retry）合计 0 次，窗口从不放宽，记录逐字节相同'],
          ['提升优先级', '一台只打电话的设备', '它的流本来就属于 AC_VO，记录逐字节相同'],
        ] },
      ],
      expect: '两边的记录条数都是 5 630，差异记录恰好 87 条，全部是 TXOP 开始记录，不同的字段只有截止时刻：从 2 528 000 纳秒变成 8 000 000 纳秒。其余 5 543 条记录逐字节相同。游戏的上行（uplink, UL）包 89 到 131 字节，平均每 30 毫秒一个，队列里从来没有第二帧，8 毫秒的 TXOP 宣告出去就立即收回。窗口不翻倍在这台手机上的那一行，在 2 秒、10 秒、30 秒三种时长上都成立。',
      meaning: '一种篡改是否起作用，取决于业务本身：队列里没有第二帧，就没有信道可以霸占；从不失败，窗口本来就不会放宽。本仿真器在 DCF 链路上拒绝那些不会被读取的字段（② 篡改放在哪里），而在这里接受它们，因为这些字段确实会被读取，只是改变不了结果。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§9.4.2.27（EDCA 参数集元素，CWmin 与 CWmax 的指数编码）、§10.2.3.2 与表 10-1（非接入点站点使用接入点通告的参数，优先级到接入类别的映射）、表 9-194（默认 EDCA 参数）、表 17-21（aCWmin、aCWmax、aSIFSTime 与 aSlotTime）、§10.23.2.4（AIFS 与 AIFSN 下限，均匀抽取）、§10.23.2.2（QSRC 与窗口的放宽）、§10.23.2.9（TXOP 上限）、§9.2.5.2 与 §9.2.5.6（Duration 的写法与 CTS 的转述）。',
    '本仿真器为演示而设的取值：七个篡改预设、8 000 µs 与 3 000 µs 两个越界幅度、三台站点的位置与随机种子。上面每一个计数与份额都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
  ],
  limits: [],
  scenario: () => tamperScenario(),
  variants: [
    { label: '作弊：提升优先级', scenario: () => tamperScenario('escalate') },
    { label: '作弊：缩短静默', scenario: () => tamperScenario('aifs') },
    { label: '作弊：窗口坍缩', scenario: () => tamperScenario('cw') },
    { label: '作弊：窗口不翻倍', scenario: () => tamperScenario('noDouble') },
    { label: '作弊：霸占信道', scenario: () => tamperScenario('txopHog') },
    { label: '作弊：虚报时长', scenario: () => tamperScenario('navInflate') },
    { label: '作弊：四种合在一起', scenario: () => tamperScenario('greedy') },
    { label: '隐藏节点的房间，不作弊', scenario: () => tamperScenario(undefined, { hidden: true }) },
    { label: '隐藏节点的房间 + 虚报时长', scenario: () => tamperScenario('navInflate', { hidden: true }) },
    { label: '联机游戏的房间 + 霸占信道（不起作用）', scenario: () => cloudGameScenario({ cheat: 'txopHog' }) },
  ],
  jumps: [
    J('第一次碰撞', firstCollision),
    J('作弊者的第一帧', (r) => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data'),
    J('第一次退避抽取', (r) => r.type === 'BACKOFF_DRAW' && r.node === 'sta-1'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '五个种子一起看，七种篡改排出来的是几级？',
      options: [
        '七级，从效果最弱到最强严格递增',
        '四级加一组：前四种篡改与不作弊的次序在每个种子上都稳定，最后三种都在 98.5 % 以上且相互次序随种子变化',
        '两级：有效的和无效的',
      ],
      answer: 1,
      explain: '一个种子上的七个数确实是递增的，但那是巧合。换四个种子再运行，最后三种的相互次序就变了——它们都已经使守规站点几乎发不出帧。',
    },
    {
      q: '一台只打游戏的手机独占一个房间，打开「霸占信道」。会发生什么？',
      options: [
        '它的时延明显下降，因为它可以长时间连续发送',
        '记录条数不变，只有 87 条 TXOP 开始记录里的截止时刻改变，其他记录逐字节相同',
        '仿真会拒绝这个配置，因为它违反标准',
      ],
      answer: 1,
      explain: '一次 TXOP 能占多久，和队列里有没有第二帧可发是两件事。游戏的上行包平均每 30 毫秒才来一个，队列里始终只有一帧，于是 8 毫秒的宣告发出后立即收回。',
    },
    {
      q: '「窗口坍缩」违反的是标准的哪一条？',
      options: [
        '倒数值必须均匀抽取',
        '非接入点站点必须使用接入点通告的 CWmin 与 CWmax',
        'CWmin 不得为 0',
      ],
      answer: 1,
      explain: '作弊者仍然均匀抽取，只是范围只剩 0；标准允许接入点通告 0 作为 CWmin（指数编码的最小值），违反的是不用接入点通告的那一组（§10.2.3.2）。',
    },
  ],
}
