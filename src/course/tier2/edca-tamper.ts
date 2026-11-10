/**
 * Wi-Fi Tier 2 · M7 · QoS 与效率 · seven ways to deviate from the EDCA parameters,
 * and the places three of them do nothing at all.
 *
 * `edca` gives the four parameter sets, `edca-cost` gives the bill; this lesson
 * asks the question those two leave open — what if a station fills those
 * parameters in itself? The engine has had `TamperCfg`, `TAMPER_KINDS` and
 * `TAMPER_PRESETS` since the patent-draft slice, the editor has had the dropdown
 * for as long, and until 2026-10-05 no lesson in the course loaded a single one
 * of the seven (design doc
 * docs/superpowers/specs/2026-10-05-built-but-untaught-design.md §0 and §5.3).
 *
 * Two things in it are measurements that contradict what the repository said
 * about itself, and both are the lesson's subject rather than footnotes:
 *
 *  - **the ladder has four rungs and a ceiling group, not seven rungs.**
 *    `src/model/scenario.ts:103` calls the presets 「from the subtle to the
 *    brazen」; across seeds 7, 11, 23, 37 and 42 the first five orders hold on
 *    every seed, and the last three are all at 98.6–100 % with their order
 *    flipping between seeds. The design document's first cut of this table was
 *    seed 7 alone and it read as a strict seven-way ordering, which is a
 *    coincidence of that seed.
 *  - **three of the seven are byte-identical to not cheating, in scenes that are
 *    perfectly legal.** That is `tests/engine/tamper-inert.test.ts`, and the
 *    lesson teaches it rather than hiding it.
 *
 * The scene is `tamperScenario()`: three saturated stations, no servers (they
 * would be inert here, and it is measured — see the builder). Every number below
 * is pinned in tests/course/edca-tamper.test.ts, at 2000 ms unless it says
 * otherwise.
 */
import { type Lesson, J, firstCollision } from '../lessonKit'
import { cloudGameScenario, tamperScenario } from '../wifiScenes'

export const edcaTamper: Lesson = {
  id: 'edca-tamper',
  module: 7,
  title: '篡改驱动——七种偏离，以及其中三种不起作用的场合',
  why: '前两课里那四组参数由接入点（access point, AP）下发，每台设备照此执行。但没有任何机制去核查：一台站点（station, STA）等待多久才开始倒数、从多宽的范围里抽取倒数值、一次占用信道多久，全部由它自己的芯片决定。修改驱动的七种做法，改动的只有四处：应等待的那段静默、抽取倒数值的竞争窗口（contention window, CW）、一次取得信道后能连续占用多久，以及帧头（MAC header）里宣告的持续时间（Duration/ID）；另外三种是把所有帧都标为语音、碰撞之后不把窗口翻倍、前四种同时使用。三台站点都有持续待发的上传数据，没有站点作弊时三台各占约三分之一的发送；换上这些改法，综合几个种子来看，份额形成稳定的四级——窗口不翻倍、缩短静默、霸占信道、提升优先级，一级比一级高；最后三种（虚报时长、窗口坍缩、四种合在一起）都使守规站点几乎无法发出帧，相互次序随种子变化，只能算作一组。窗口不翻倍反而使全场碰撞增多；抑制作用最强的几种几乎没有碰撞，所以碰撞少并不意味着信道运行正常。虚报时长在隐藏节点（hidden station）的房间里无需作弊者自己抑制其他站点：接入点沿用请求中的时长作出应答，收不到作弊者的那台站点按照接入点的应答保持静默。但这七种里，有三种在其他完全合法的场景中不改变记录中的任何一个字节：只打电话的设备本来就属于语音那一类；独占空口的设备从不发生碰撞，窗口本来就不会翻倍；只打游戏的手机队列（queue）中始终只有一帧，宣告的占用时长再长也会立即收回。',
  outcomes: [
    '说明七种偏离各自修改的是哪个参数、违反的是哪一条规定',
    '读出四级阶梯上每一级的份额，并说明为什么最后三种只能算作一组',
    '指出三种偏离各自在什么场合下不起作用（记录逐字节相同），以及原因在哪一层',
  ],
  needs: ['edca', 'edca-cost', 'collisions-cw', 'txop'],
  terms: [
    { term: 'tampered driver', plain: '篡改驱动：一台设备不按下发的那套参数竞争，而是自行填写一套对自己更有利的参数' },
    { term: 'TXOP limit', plain: '传输机会上限：一次取得信道之后最多能连续占用多长时间，标准为四类各规定了一个值' },
    { term: 'Duration', plain: '持续时间字段：每一帧帧头里宣告「这次交互还需要多长时间」的那个数值，邻居按照它保持静默' },
  ],
  picture: [
    { heading: '这套规则没有监督机制', text: '增强型分布式信道接入（enhanced distributed channel access, EDCA）全部的约束力，在于每一台设备都按照同一张表等待和抽取。那张表在标准里是信标（Beacon）帧里的一个 EDCA 参数集（parameter set）元素，由接入点广播；而等待多久、抽取范围多宽这两件事发生在设备自己的芯片里，在空口上无法观察到。一台修改了驱动的设备不需要破解任何东西，它只需把自己那几个数填小一些。更重要的是：本仿真器根本不发送管理帧（management frame），于是这里的作弊者偏离的，是一套从未被广播过的参数。' },
    { kind: 'watch', jump: 0, heading: '先看一个没人作弊的房间', text: '载入仿真。三台站点都在饱和上传，用的是同一套尽力而为的参数。跳到第一次碰撞，再把三台的发送计数并排比较：6 099、7 343、5 967 帧，彼此相差不到 8 个百分点。这就是这套规则下「公平」的含义——不是精确均分，而是没有哪台站点具有系统性的优势。' },
    { heading: '七种改法，改动的只有四处', text: '编辑器里那个下拉框有七个预设，而它们改动的其实只有四处：这一类应等待的那段静默，由它的仲裁帧间间隔数（arbitration interframe space number, AIFSN）决定；抽取倒数值的范围，也就是那两个竞争窗口（contention window, CW）——最小竞争窗口（minimum contention window, CWmin）与最大竞争窗口（maximum contention window, CWmax）；一次取得信道之后能连续占用多久，即这一类的 TXOP 上限（TXOP limit），而这样的一次占用在标准里叫一个传输机会（transmit opportunity, TXOP）；以及每一帧帧头（MAC header）里宣告的持续时间（Duration/ID）。第五种是把自己所有的帧都标为语音那一个接入类别（access category, AC），第六种是碰撞之后不把窗口翻倍，第七种是前面四种同时使用。' },
  ],
  numbers: [
    { kind: 'table', heading: '七个预设，各自改了什么、违反了哪一条', head: [
      '预设', '它填进去的值', '标准里的规定', '出处',
    ], rows: [
      ['提升优先级', '所有帧都按 AC_VO 排队', '用户优先级到接入类别的映射由 Table 10-1 规定', '§10.2.3.2'],
      ['缩短静默', 'AIFSN = 1', '非接入点站点的 AIFSN 不得小于 2；1 是留给接入点的', '§10.23.2.4'],
      ['窗口坍缩', 'CWmin = CWmax = 0', '倒数值应在 0 与当前窗口之间均匀抽取', '§10.23.2.4'],
      ['窗口不翻倍', '失败后窗口保持不变', 'CW 应取 CWmax 与 2^QSRC × (CWmin+1) − 1 中较小的那个', '§10.23.2.2'],
      ['霸占信道', 'TXOP 上限 = 8 000 µs', '一次传输机会的时长不得超过该类的上限', '§10.23.2.9'],
      ['虚报时长', 'Duration 多加 3 000 µs', 'Duration 应覆盖本次交互实际还需要的时间', '§9.2.5.2'],
      ['四种合在一起', '前四种同时生效', '以上全部', '以上全部'],
    ] },
    { heading: '那两个越界的数值由本仿真器选定', text: '8 000 µs 与 3 000 µs 不是标准里的任何一个数。标准规定了四类各自的传输机会上限（视频那一类是 4.096 毫秒，Table 9-194），也规定了持续时间应如何填写，但它不会规定「一个违规设备会越界多少」——那不属于标准的内容。8 000 µs 是视频那一类上限的约两倍，选取的就是一个明显越界的值。' },
    { kind: 'table', heading: '同一个房间，七种改法各运行两秒（种子 7）', head: [
      '配置', '作弊者的份额', '守规 A 发出', '守规 B 发出', '本轮碰撞',
    ], rows: [
      ['不作弊', '31.4 %', '7 343', '5 967', '126'],
      ['窗口不翻倍', '41.9 %', '6 555', '3 757', '151'],
      ['缩短静默', '51.7 %', '5 578', '3 472', '119'],
      ['霸占信道', '63.6 %', '3 951', '3 489', '65'],
      ['提升优先级', '95.6 %', '679', '195', '83'],
      ['虚报时长', '99.4 %', '25', '100', '1'],
      ['窗口坍缩', '99.9 %', '25', '0', '20'],
      ['四种合在一起', '100.0 %', '0', '0', '1'],
    ] },
    { heading: '这张表只有四级，不是七级', text: '上面那八行是一个种子的运行结果，而一个种子得出的顺序未必反映规律。五个种子（7、11、23、37、42）一起看：前四级在每一个种子上都严格递增——不作弊 29.4 到 34.1 %、窗口不翻倍 35.3 到 41.9 %、缩短静默 44.5 到 56.5 %、霸占信道 57.7 到 64.5 %、提升优先级 93.1 到 96.6 %。而最后三种全部落在 98.6 到 100.0 % 之间，它们的相互次序随种子变化：种子 7 是虚报时长最轻，种子 23 则是窗口坍缩最轻，种子 37 和 42 上有两种并列在 100.0 %。它们都已经使守规站点几乎无法发出帧，「哪一种抑制作用更强」这个问题在这个场景里没有答案。' },
    { heading: '两处需要单独说明的地方', text: '第一，窗口不翻倍是七种里效果最弱的一种，而它反而使碰撞从 126 次增加到 151 次。一台碰撞之后不放宽窗口的设备，立即又以同样小的范围重新参与竞争，于是它多获得的那 10 个百分点，是以全场多出的 25 次碰撞为代价的。第二，虚报时长与四种合在一起使碰撞降到 1 次。一台完全抑制了邻居的设备不需要碰撞——在这一课里，「几乎没有碰撞」不是信道正常的标志，而是一种异常现象。' },
    { kind: 'steps', heading: '虚报时长如何经由接入点的应答生效', items: [
      '换到隐藏节点（hidden station）那个变体：两台站点隔着两道砖墙，互相收不到，但都能收到中间的接入点。',
      '帧长超过了 RTS 门限（RTS threshold），于是每一次交互都先发一个请求发送（request to send, RTS）。作弊者在这个 RTS 的持续时间字段里多写了 3 000 µs。',
      '接入点收到之后回复一个允许发送（clear to send, CTS），并沿用了请求中的那个数值——标准要求它这样做，CTS 的 Duration 就是请求中的那个值减去已经经过的时间。',
      '另一台站点收不到作弊者，却能收到接入点。它按照这个 CTS 设置自己的网络分配向量（network allocation vector, NAV）：本来最长 2 383.2 µs，现在是 5 383.2 µs，恰好多出 3 000。',
      '整轮运行中，它被这样抑制的次数从 58 次增加到 116 次，而设置这些 NAV 的每一帧都来自接入点。时间轴上找不到一条以作弊者的数据帧（data frame）为来源的 NAV——作弊者借接入点的 CTS 实现了抑制。',
    ] },
    { heading: '三种偏离，在其他合法场景中不起作用', text: '把同样七个预设用到其他合法场景上，逐条比对记录，有三种的整条记录流与不作弊时逐字节相同。提升优先级用在一台只打电话的设备上：它的流本来就属于语音那一类，再标一次等于没有标。窗口不翻倍用在一台独占空口的设备上：那一轮里碰撞、确认超时与重传（retry）合计 0 次，窗口本来就不会翻倍，「不翻倍」于是不产生任何效果——这一条在 2 秒、10 秒、30 秒三种时长与两个种子上都成立，它是结构性的，不是短时运行的巧合。而在一个传统分布式协调功能（distributed coordination function, DCF）的房间里，提升优先级、缩短静默与霸占信道三种所改的字段都不会被读取：没有接入类别可标、使用的是原来那段固定静默、也根本不存在传输机会。这三种用在那样的房间里，本仿真器现在直接拒绝，并指出应修改哪里——一个可以写出、而可证明不产生任何效果的配置，比一个被拒绝的配置更容易让人误以为自己在作弊。而「四种合在一起」仍然被接受，因为它那五个字段里还有一对窗口会被读取：于是它在那个房间里退化为「窗口坍缩」，两边的记录流逐字节相同——这也正是「那三个字段在这里不会被读取」这句话目前唯一可以测量验证的地方。' },
    { heading: '最典型的不起作用：一个数值被输出，其他一切都不随之改变', text: '把霸占信道用到「联机游戏的房间」那个变体上——一台手机打游戏，一台路由器，一台服务器。两边的记录条数都是 5 630，差异记录恰好 87 条，全部是传输机会的开始记录，不同的字段只有一个：宣告的截止时刻从 2 528 000 纳秒变成 8 000 000。其余 5 543 条记录逐字节相同。原因在于业务本身的特性，而不在于代码：游戏的上行（uplink, UL）包 89 到 131 字节、平均每 30 毫秒一个，队列（queue）里从来没有第二帧可发，于是一个 8 毫秒的传输机会宣告出去，立即就被收回。「霸占信道」这种改法，在一台只打游戏的手机上没有信道可以霸占。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '这一课最根本的一条：引擎始终不发送任何管理帧（management frame）——没有信标，也没有关联过程。那四组参数在真实网络里是接入点在信标的 EDCA 参数集元素里广播的，而这里它们是 phy.ts 的一张常量表。于是作弊者偏离的，是一套从未被广播过的参数。这不影响它获得多少份额，却使「这种行为如何被发现」在本模型中无从讨论。' },
    { kind: 'out-of-scope', text: '如何识别一台作弊的设备，这一课无法回答。接入点能看到的只有到达时刻与帧头，而本引擎不为它提供任何统计接口，也不建模任何合规终端的协助上报。docs/reports 下那份篡改报告按七种改法逐个判断过「仅凭接入点是否足以识别」，结论分为足够、需要协助、足够但需要统计样本三类——那是另一门课的内容，而它所需要的管理帧这里一帧也没有。' },
    { kind: 'model-value', text: '8 000 µs 与 3 000 µs 这两个越界值是本仿真器选定的，选定的理由是「明显越界」，而不是某台实测到的违规设备。换一个越界幅度，霸占信道那一级的份额就不是 63.6 %；而虚报时长那一级已经接近 100 %，再增加也看不出区别。四级阶梯里只有级与级之间的顺序是稳定的，每一级的具体数值都随这两个取值变化。' },
    { kind: 'threshold', text: '份额是按两秒内发出的帧数计算的，而这三台站点离接入点一样远、信号电平不随时间变化、房间里没有外来干扰。真实房间里一台作弊设备的收益会与信号强弱、邻居网络和它自己的位置等因素交织在一起，没有哪一次测量能像这里一样把原因单独分离出来。这也是为什么本课的结论写成跨五个种子的区间，而不是写成八个三位小数。' },
  ],
  sources: [
    '非接入点站点的 AIFSN 下限 2 见 IEEE Std 802.11-2024 的 §10.23.2.4，同一条给出 AIFS[AC] = aSIFSTime + AIFSN × aSlotTime；窗口翻倍的式子 min(CWmax, 2^QSRC × (CWmin+1) − 1) 见 §10.23.2.2。',
    '四类的默认 AIFSN（7/3/2/2）、CWmin 与 CWmax（15/1023、15/1023、7/15、3/7）与传输机会上限（2.528/2.528/4.096/2.080 毫秒）见 Table 9-194（EDCA 参数集元素，§9.4.2.27）；16 µs 与 9 µs 取自 §17.4.4。',
    '用户优先级到接入类别的映射见 Table 10-1（§10.2.3.2）；一次传输机会不得超过该类上限见 §10.23.2.9；EDCA 下 Duration 的设定见 §9.2.5.2。',
    '七个预设的具体取值、8 000 µs 与 3 000 µs 这两个越界幅度、三台站点的位置与随机种子，都是本仿真器的模型取值，而非标准中的数值。',
  ],
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
  observe: [
    '不作弊那一轮，三台的倒数色块宽度看不出差别，发送计数 6 099、7 343、5 967。换到「窗口坍缩」：作弊者的每一个色块都写着 0，两秒里它发了 19 935 帧，另外两台一共 25 帧。',
    '换到「霸占信道」，把鼠标悬停在作弊者的传输机会色块上：截止时刻写的是 8 000 µs，而标准给这一类的上限是 2 528 µs。再看两台守规站点的色块，它们在这 8 毫秒里没有任何变化。',
    '换到「隐藏节点的房间 + 虚报时长」，点开另一台站点的网络分配向量记录：来源写的是接入点的 CTS，不是作弊者的数据帧。最长的一条是 5 383.2 µs，而不作弊那一轮同一处是 2 383.2 µs。',
  ],
  tryThis: [
    '把「四种合在一起」这个变体里的三台站点都改成传统的 802.11g（关闭增强型分布式信道接入），再和「窗口坍缩」运行同样长的时间进行比较：两边的记录流完全相同。五个被改的字段里有三个在这种房间里根本不会被读取，剩下的只有那一对窗口——一个在编辑器里被标成「最狠」的预设，在这里退化成了单独的「窗口坍缩」。',
    '在「联机游戏的房间 + 霸占信道」和不作弊的同一个房间之间来回切换，比对碰撞次数、三台的发送计数与应用往返时延：没有任何一个数发生变化，只有传输机会记录里宣告的那个截止时刻不同。这是「允许但不起作用」最典型的情形——一个数值被输出，而其他一切都不随之改变。',
  ],
  quiz: [
    {
      q: '五个种子一起看，七种改法排出来的是几级？',
      options: [
        '七级，从效果最弱到最强严格递增',
        '四级加一个封顶组：前五种次序稳定，最后三种都在 98.5 % 以上且相互次序随种子变化',
        '两级：有效的和无效的',
      ],
      answer: 1,
      explain: '一个种子上的七个数确实是递增的，但那是巧合。换四个种子再运行，最后三种的相互次序就发生了变化——它们都已经使守规站点几乎无法发出帧，份额已接近 100 %。',
    },
    {
      q: '一台只打游戏的手机，独占一个房间，把「霸占信道」打开。会发生什么？',
      options: [
        '它的时延明显下降，因为它可以长时间连续发送',
        '记录条数不变，只有 87 条传输机会记录里宣告的截止时刻改变，其他记录逐字节相同',
        '仿真会拒绝这个配置，因为它违反标准',
      ],
      answer: 1,
      explain: '一次传输机会能占多久，和队列里有没有第二帧可发是两件事。游戏的上行包平均每 30 毫秒才来一个，队列里始终只有一帧，于是 8 毫秒的宣告发出后立即被收回。',
    },
    {
      q: '「窗口不翻倍」是七种里份额最低的一种，但它那一轮的碰撞比不作弊时还多。为什么？',
      options: [
        '它发送得更多，所以发生碰撞的机会也多',
        '一台碰撞之后不放宽抽取范围的设备，立即又从同样小的范围里抽取倒数值重新竞争，于是再次发生碰撞',
        '它的帧更长，占用信道的时间更长',
      ],
      answer: 1,
      explain: '窗口翻倍的作用本来就是在碰撞之后使各站点的发送时刻分散开。拒绝翻倍的那台设备确实多拿到了约 10 个百分点，而代价是全场多出 25 次碰撞——这些多出来的碰撞没有为任何站点带来一帧成功的发送。',
    },
  ],
}
