/**
 * Wi-Fi Tier 4 · M13 · 草案里的 Wi-Fi 8 · from one measurement to something a group can act on.
 *
 * Standard-first shape (2026-11-11). ① is the IEEE 802.11 record this lesson relies on, with a
 * source for each fact: what the TGbn specification framework is (its own abstract, 11-24/0209r19),
 * how an adopted text carries its motion and references, the TGbn timeline (status page snapshot
 * of 2026-09-08), the two letter-ballot comment sheets (11-25/1772r16, 11-26/1613r0) and the
 * comment-resolution step that produced D2.0; then the documents behind the four new rungs
 * (Motion #42 → [86] 11-24/1186r1, Motion #216 → [274, 275] 11-24/0469r0 and 11-24/0753r1, Motion
 * #417 → [383, 384], of which 11-25/0721r3 is cited); and the standard mechanism the measurement
 * examines — receiver minimum sensitivity as a conformance level (802.11be-2024 §36.3.21.2) and
 * rate selection outside the standard (802.11-2024 §10.6.1). No voting threshold is stated: none
 * could be verified in the corpus.
 *
 * ② says what this engine does where those mechanisms meet the measurement (hard decode
 * threshold, the rate controller, hashed fading, the coherence field that is not read at
 * sigma 0). ③ is four guided runs through the three checks.
 *
 * Every figure is read back out of the lesson in tests/course/claim-to-contribution.test.ts.
 */
import { type Lesson, J } from '../lessonKit'
import { uhrLadderScenario } from '../wifiScenes'

export const claimToContribution: Lesson = {
  id: 'claim-to-contribution',
  module: 13,
  title: '同一位置换一批种子就换一个结果——一份测量要通过哪三项检验，才能成为一份文稿',
  why: '新的调制与编码方式（modulation and coding scheme, MCS）进入 Wi-Fi 8 草案，靠的是一系列公开文稿：一份提案、另一家公司对同一组档位的仿真结果、把它们写进 TGbn 规范框架的动议，以及之后两轮信函投票中各有七八千条的意见。一个仿真结果要值得被这样引用，至少要经过三项检验。第一，换一批种子：上一课在客厅深处给出细阶梯快 13.26 %，同一位置换一批六十个种子是 7.60 %，换另外六十个是 8.74 %，一百二十个是 7.23 %；只运行一次，种子 13 给出慢 6.25 %，种子 47 给出快 58.13 %。所以一个均值只能与它的种子表一起报告，增加种子数也解决不了这个问题。第二，先核查测量工具：阴影的标准差为零时，相干时间这个字段可以写入、引擎也会读取，从 5 毫秒扫描到 500 毫秒输出却完全相同，因为计算阴影的那一步在读取它之前就已返回；标准差不为零时它重新起作用。第三，问结论在什么条件下不成立：关闭起伏后的定点比值等于两档每符号（symbol）数据比特数之比，换种子、换运行时长都不变，可以写到最后一位；客厅中段只开启阴影的那一项，四批种子都稳定地快不到一成，能写的是量级；墙后一步那一项连正负都随种子翻转，能写的只剩机理——细阶梯的接收失败在每一格中都更多。',
  outcomes: [
    '说出 TGbn 的规范框架、动议、信函投票与意见决议各是什么，并沿公开记录找到四个新档背后的文稿',
    '把仿真结果分为三类——换一批种子仍然成立的、只有量级成立的、连正负都不成立的——并说出每一类能写成什么样的结论',
    '在报告结论之前先核查测量工具：指出一个可以写入、引擎也会读取、却不影响任何记录的字段，并说出它在什么配置下重新起作用',
  ],
  needs: ['uhr-rate-ladder', 'fading', 'rate-fallback', 'bianchi-vs-sim'],
  terms: [
    { term: 'letter ballot (LB)', plain: '信函投票：工作组对某一版草案的正式投票，投票人可以针对各条款提出意见。D1.0 那一轮是 LB291，D2.0 那一轮是 LB296' },
    { term: 'comment resolution (CR)', plain: '意见决议：对一条意见的处置——接受、修改后接受，或者拒绝并写明理由；处置之后的文字用来生成下一版草案' },
    { term: 'TBD (to be determined)', plain: '待定：规范框架或草案正文里「这一处还没定」的标记' },
  ],
  standard: [
    { heading: '规范框架是什么（11-24/0209r19，摘要）', text: 'TGbn 的规范框架是起草 P802.11bn 修正案所依据的框架文件：它给出最终修正案各功能块的提纲，反映工作组对规范大致轮廓的共识；开始时细节很少，标出仍需达成一致的地方，随时间演进，直到细节足以开始起草修正案本身。框架中每一段被采纳的文字之后，都标着采纳它的动议编号和方括号里的参考文献编号，例如「[Motion #216, [264] and [274, 275]]」。' },
    { heading: 'TGbn 的时间线（TGbn 状态页，2026 年 9 月 8 日的快照）', text: 'PAR 于 2023 年 7 月获批；D0.1 于 2025 年 1 月完成；D1.0 于 2025 年 7 月进入首轮工作组信函投票；D2.0 于 2026 年 7 月进入工作组信函投票；之后计划 D3.0 于 2027 年 1 月进入工作组信函投票，D4.0 于 2027 年 5 月进入首轮 SA 投票，2028 年 3 月工作组最终批准，2028 年 5 月由 RevCom 与 SASB 批准。P802.11bn 至今是未批准的草案。' },
    { heading: '信函投票与意见决议（11-25/1772r16，11-26/1613r0；TGbn 状态页）', text: 'D1.0 那一轮信函投票是 LB291，意见表 11-25/1772r16 中带条号的意见有 8 523 条，落在 618 个条号上；D2.0 那一轮是 LB296，意见表 11-26/1613r0 中有 7 874 条，落在 712 个条号上。2026 年 7 月的全体会议上，TGbn 处理了约 900 条 LB291 意见，用这些意见决议文稿生成 D2.0，工作组随后批准在 D2.0 上发起为期 30 天的信函投票。' },
    { kind: 'table', heading: '四个新档在公开记录中的路径（参考文献编号按规范框架的文献表解析）', head: ['步骤', '文稿或动议', '内容'], rows: [
      ['提案', '11-24/0469r0', '四种调制（modulation）与码率组合的最初提案'],
      ['仿真结果', '11-24/0753r1', '另一家公司对同一组档位的仿真'],
      ['写进框架', 'Motion #42，引 11-24/1186r1', '四个组合作为 11bn 的新 MCS'],
      ['定为必选', 'Motion #216，引 11-24/0469r0 与 11-24/0753r1', '四档必选，256-QAM（quadrature amplitude modulation）2/3 对 20 MHz 设备可选'],
      ['收发规范', 'Motion #417，引 11-25/0721r3 等两份', '四档的接收最小输入灵敏度'],
      ['第一轮意见', '11-25/1772r16', 'D1.0 的 LB291 意见表'],
      ['第二轮意见', '11-26/1613r0', 'D2.0 的 LB296 意见表'],
    ] },
    { heading: '框架里仍未确定的地方（11-24/0209r19）', text: '规范框架 r19 中标为 TBD 的地方共 143 处，分布在 49 个三级小节中的 26 个；例如 UHR-SIG 中 MCS 字段的配置就是待定的。' },
    { heading: '这次测量考察的标准机制（IEEE Std 802.11be-2024 §36.3.21.2；IEEE Std 802.11-2024 §10.6.1）', text: '接收最小输入灵敏度（sensitivity）是一项符合性要求：在表 36-67 给出的电平上，误包率须小于 10%。新档的灵敏度（Motion #417）是同一类要求。用哪一档发送，由速率切换算法决定，而这个算法不在标准范围之内。所以「细阶梯在起伏的信道上值多少」不是标准能回答的问题，答案取决于实现的选档算法和信道。' },
    { kind: 'steps', heading: '一组档位进入草案的路径，以四个新档为例', items: [
      '提案人提交提案文稿（11-24/0469r0），在任务组会议上介绍。',
      '其他成员提交对同一问题的仿真结果（11-24/0753r1）。',
      '任务组通过动议，把被采纳的文字写进规范框架，并标出所依据的文稿（Motion #42、#216、#417）。',
      '草案按规范框架起草；D1.0 进入信函投票 LB291，投票人针对条款提出意见（11-25/1772r16）。',
      '任务组逐条处置意见，用意见决议文稿生成 D2.0；D2.0 进入 LB296（11-26/1613r0）。',
    ] },
  ],
  implementation: [
    { topic: '新档的灵敏度', standard: '−78、−71、−69、−60 dBm（Motion #417，20 MHz）', sim: '照此取值，与上一课相同。', kind: 'faithful' },
    { topic: '接收判决', standard: '在灵敏度电平上误包率小于 10%（802.11be-2024 §36.3.21.2）', sim: '每一档一条硬门限：信干噪比（signal-to-interference-plus-noise ratio, SINR）不低于门限就解出，低于就丢失；没有误包率曲线。', kind: 'choice' },
    { topic: '选档', standard: '速率切换算法不在标准范围之内（§10.6.1）', sim: '上限取平均信噪比（signal-to-noise ratio, SNR）减去 3 dB 后仍满足的最高索引；连续两次失败降一个索引，连续十次成功升一个索引。本课三类结果的划分依赖这套算法，换一个按每帧接收质量选档的算法，每一项都要重新测量。', kind: 'choice' },
    { topic: '信道起伏', standard: '标准不定义信道模型', sim: '阴影 σ = 4 dB、相干时间 100 ms；按每一帧抽取瑞利衰落。', kind: 'value' },
    { topic: '随机种子', standard: '标准不涉及', sim: '小尺度衰落是按（种子、发端、收端、帧）做的哈希，不是随时间相关的随机过程；换一个种子就换掉整张抽取表，而不是同一条信道的另一段时间。', kind: 'choice' },
    { topic: '相干时间字段', standard: '标准不涉及', sim: '计算阴影的那一步在标准差为 0 时直接返回 0，不读取相干时间；所以在这个配置下改相干时间不改变任何记录。本课的两个「关闭阴影」变体就是这一对。', kind: 'choice' },
    { topic: '前导码（preamble）与符号时长', standard: '规范框架未给出 UHR 的取值', sim: '复用 Wi-Fi 7 的值，所以两条阶梯的对照只测量阶梯本身。', kind: 'choice' },
    { topic: '256-QAM 2/3 的必选资格', standard: '只支持 20 MHz 的设备可选（Motion #216）', sim: '每一台 uhr 设备都支持它。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '你这一次运行给出的数',
      jump: 0,
      more: [0],
      steps: [
        '载入本课场景（上一课的长公寓，客厅深处那台持续上传的笔记本，阴影与瑞利两层都开启，种子 2），跳到第一帧使用新档发送的时刻，读出模式与 MCS；再跳到第一次从新档降档。',
        '切换到「Wi-Fi 7 · 同一位置」，两边各运行 300 ms，比较吞吐。',
      ],
      expect: 'Wi-Fi 8 是 uhr、MCS 5，Wi-Fi 7 是 eht、MCS 3；吞吐 20.440 对 16.600 Mb/s，即 +23.13 %，而上一课在同一位置给出的二十个种子均值是 +13.26 %。',
      meaning: '一次运行是一张随机抽取表的结果（②的随机种子），不是阶梯的性质；你刚得到的数并不是那张表中的数。',
    },
    {
      heading: '检验一：换一批种子',
      jump: 1,
      more: [1, 2, 3, 4],
      steps: [
        '载入「Wi-Fi 8 · 种子 13」与「Wi-Fi 7 · 种子 13」，再载入种子 47 那一对，读出吞吐。',
        '对照下表：同一位置、同一对阶梯，四批种子的均值。',
      ],
      blocks: [
        { kind: 'table', heading: '同一位置，四批种子（均值之比；括号内是这一批中 Wi-Fi 8 更快的个数）', head: ['种子批次', '墙后一步 · 仅阴影', '客厅中段 · 仅阴影', '客厅深处 · 两层'], rows: [
          ['二十个', '−0.37 %（8/20）', '+8.15 %（19/20）', '+13.26 %（14/20）'],
          ['六十个质数', '+1.77 %（36/60）', '+9.21 %（59/60）', '+7.60 %（44/60）'],
          ['一到六十', '+1.32 %（30/60）', '+8.13 %（56/60）', '+8.74 %（44/60）'],
          ['一百二十个', '+1.59 %（67/120）', '+9.46 %（117/120）', '+7.23 %（84/120）'],
        ] },
      ],
      expect: '种子 13：9.000 对 9.600 Mb/s，细阶梯慢 6.25 %；种子 47：18.280 对 11.560 Mb/s，细阶梯快 58.13 %。四批均值两两不同，两批同样是六十个的种子也不一致；表中三列分别是正负都不定、量级稳定、正号稳定而量级不稳定。',
      meaning: '「n = 60」描述的是样本大小，不是样本本身；一个均值要和它的种子表（本课是 1 加前十九个质数、1 加前五十九个质数、一到六十、1 加前一百一十九个质数）一起报告。',
    },
    {
      heading: '检验二：先核查测量工具',
      variant: 5,
      more: [6],
      steps: [
        '在「Wi-Fi 8 · 关闭阴影 · 相干 5 毫秒」与「Wi-Fi 8 · 关闭阴影 · 相干 500 毫秒」之间来回切换，比较记录条数、接收失败次数与吞吐。',
        '对照下表的右列：同一个字段在阴影标准差 4 dB 下的结果。',
      ],
      blocks: [
        { kind: 'table', heading: '相干时间参数（客厅深处、瑞利衰落开启、300 ms、种子 2，Wi-Fi 8 的吞吐）', head: ['相干时间', '阴影标准差 0', '阴影标准差 4 dB'], rows: [
          ['5 毫秒', '17.120000 Mb/s', '14.320 Mb/s'],
          ['20 毫秒', '17.120000 Mb/s', '11.680 Mb/s'],
          ['100 毫秒', '17.120000 Mb/s', '20.440 Mb/s'],
          ['500 毫秒', '17.120000 Mb/s', '28.000 Mb/s'],
        ] },
      ],
      expect: '两个变体都是 9 472 条记录、11 次接收失败，吞吐到小数点后第六位相同；同一个字段在标准差 4 dB 下从 14.320 变化到 28.000 Mb/s。',
      meaning: '在标准差为 0 的配置下相干时间不会被读取（②）；只做左列那一步，得出的是「这个字段没有用」，而这是错误的结论。',
    },
    {
      heading: '检验三：结论在什么条件下不成立',
      variant: 7,
      jump: 3,
      more: [8],
      steps: [
        '载入「Wi-Fi 8 · 无起伏」与「Wi-Fi 7 · 无起伏」，读出吞吐，算出比值。',
        '回到本课场景，跳到第一次出现深阴影，看起伏开启时电平怎样离开窗口。',
      ],
      blocks: [
        { kind: 'formula', heading: '关闭起伏后的定点比值', text: '624 / 468 = 1.3333；实测 38.720 / 29.040 = 1.3333。', note: '种子 1、2、7、17、99 五个种子，300 ms 与 600 ms 两种运行时长，十个组合给出同一个比值。墙后一步那个位置的计算值是 1 248 / 1 170 = 1.0667，300 ms 实测 +6.25 %、600 ms 实测 +6.71 %：300 ms 结束时最后一组聚合被截断，两臂截断的位置不同。' },
      ],
      expect: '关闭起伏后比值正好等于两档 N_DBPS 之比，与种子无关；所以「细阶梯毫无价值」被同一条链路（link）上的这次测量直接否定。开启起伏后，三个位置的接收失败都是细阶梯更多。',
      meaning: '能写到最后一位的只有定点比值，而它也有前提：运行时间足够长。起伏下的结论取决于本仿真器的选档算法与信道模型（②），标准对两者都不作规定（①）。',
    },
  ],
  sources: [
    'TGbn 规范框架 11-24/0209r19（2025 年 8 月 2 日）：摘要（规范框架的用途）、Motion #42（引 [86] 11-24/1186r1）、Motion #216（引 [274, 275] 11-24/0469r0 与 11-24/0753r1）、Motion #417（引 [383, 384]，其中 [383] 是 11-25/0721r3）；文献表按编号逐一解析并与文稿题目核对过。TBD 的 143 处与 26 / 49 个三级小节是在本仓库整理的规范框架文本中逐一统计的。',
    '信函投票意见表：11-25/1772r16（P802.11bn D1.0，LB291，带条号的意见 8 523 条，618 个条号）与 11-26/1613r0（D2.0，LB296，7 874 条，712 个条号）；本课只引用条数与条号数。TGbn 状态页（https://www.ieee802.org/11/Reports/tgbn_update.htm，2026 年 9 月 8 日的快照）：时间线，以及 2026 年 7 月会议处理约 900 条 LB291 意见、生成 D2.0 并批准 30 天信函投票。P802.11bn 是未批准的草案，条号与取值都可能变动。',
    'IEEE Std 802.11be-2024 §36.3.21.2 与表 36-67（接收最小输入灵敏度：误包率小于 10%）；IEEE Std 802.11-2024 §10.6.1（速率切换算法不在标准范围之内）。',
    '课文里每一个百分数都由本仿真器运行得出，不是草案给出的。阴影 σ = 4 dB 与 100 ms 相干时间、按每一帧抽取的瑞利衰落、选档时 3 dB 的余量，都是本仿真器自己的取值。',
  ],
  limits: [],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '上一课在客厅深处给出 +13.26 %，本课四批种子给出 +13.26 / +7.60 / +8.74 / +7.23 %。最该写进一份文稿的是哪一种说法？',
      options: [
        '就写 +13.26 %，因为那是课文给出的那一批',
        '取四批的平均 +9.2 %，这样就不依赖某一批种子',
        '「这个位置失去了理论值 +33.33 % 的大半，剩余收益在 7 % 到 14 % 之间，四批种子给出的数各不相同」——数值要与测量条件一起报告',
      ],
      answer: 2,
      explain: '四批的平均仍然是一张种子表的函数，只是表更长；只报告一批会让读者把它当成阶梯的性质。能经受更换种子批次的只有量级。',
    },
    {
      q: '把阴影的标准差设成 0，再把相干时间从 5 毫秒扫到 500 毫秒，四行输出完全相同。这次扫描真正证明的是哪一条？',
      options: [
        '相干时间这个字段对吞吐没有影响',
        '在这个配置下相干时间不会被读取：计算阴影的那一步在标准差为 0 时提前返回；标准差改回 4 dB，同一个字段就使结果从 14.320 变化到 28.000 Mb/s',
        '阴影这一层在本仿真器里根本没有接入',
      ],
      answer: 1,
      explain: '第一条和第三条都把「这一次不会被读取」当成了「它不起作用」。换一个仍然合法的配置，看同一个字段在那里是否被读取，就能区分这两种情况。',
    },
    {
      q: '四个新档被定为必选的那条动议，引用的是哪两份文稿？',
      options: [
        'D1.0 与 D2.0 的两份意见表',
        '最初的提案 11-24/0469r0 与另一家公司的仿真结果 11-24/0753r1',
        '规范框架 11-24/0209r19 本身',
      ],
      answer: 1,
      explain: 'Motion #216 后面的方括号是 [264] and [274, 275]；按规范框架的文献表，274 是 11-24/0469r0，275 是 11-24/0753r1。一份仿真结果和提案并列被引用，正是本课三项检验要服务的那种工作。',
    },
  ],
  scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 2 }),
  variants: [
    { label: 'Wi-Fi 7 · 同一位置', scenario: () => uhrLadderScenario('eht', 'far', 'both', { seed: 2 }) },
    { label: 'Wi-Fi 8 · 种子 13', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 13 }) },
    { label: 'Wi-Fi 7 · 种子 13', scenario: () => uhrLadderScenario('eht', 'far', 'both', { seed: 13 }) },
    { label: 'Wi-Fi 8 · 种子 47', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 47 }) },
    { label: 'Wi-Fi 7 · 种子 47', scenario: () => uhrLadderScenario('eht', 'far', 'both', { seed: 47 }) },
    { label: 'Wi-Fi 8 · 关闭阴影 · 相干 5 毫秒', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: 5 }) },
    { label: 'Wi-Fi 8 · 关闭阴影 · 相干 500 毫秒', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: 500 }) },
    { label: 'Wi-Fi 8 · 无起伏', scenario: () => uhrLadderScenario('uhr', 'far') },
    { label: 'Wi-Fi 7 · 无起伏', scenario: () => uhrLadderScenario('eht', 'far') },
  ],
  jumps: [
    J('第一帧使用那个新档', (r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mode === 'uhr' && r.frame.mcs === 5),
    J('第一次接收失败', (r) => r.type === 'RX_FAIL'),
    J('第一次从那个新档降档', (r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined && r.frame.mcs < 5),
    J('第一次出现深阴影', (r) => r.type === 'RX_START' && r.shadowDb !== undefined && r.shadowDb < -4),
  ],
}
