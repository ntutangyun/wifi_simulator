/**
 * Wi-Fi Tier 4 · M13 · 草案里的 Wi-Fi 8 · from one measurement to something a group can act on.
 *
 * **The second lesson of tier 4, and the first lesson in the whole course whose SUBJECT is
 * another lesson's number.** It rides `@uhr-rate-ladder`'s scene constructor — the same
 * `uhrLadderScenario`, at the `'far'` spot with both fading layers on — because the number under
 * examination is that lesson's: the +11.78 % printed in its faded table. There is precedent for
 * reusing a constructor at another argument value (`@uwb-nba-coexist` on `uwbNbaScenario`); what
 * is new is that the two lessons are pointed at the same measurement, one to make it and one to
 * grade it. Every jump below was run before it was written, and all four fire in this lesson's
 * own base scene inside 300 ms (`tests/course/claim-to-contribution.test.ts` asserts the four
 * instants).
 *
 * **Why this is not a lesson about the IEEE process.** The repository's gate is that a lesson
 * which cannot produce records does not ship, and the cheap way to fake this subject is prose
 * about procedure with a token `watch` hung off it. So the spine is three gates the reader walks
 * IN the simulator, each one an event that actually happened in this repository's own history:
 *
 *  1. **a number that depends on which batch you took.** Slice W12c measured the 客厅深处 cell at
 *     +11.78 % over twenty seeds, +7.40 % over sixty primes, +8.65 % over 1…60 and +6.60 % over
 *     a hundred and twenty — and a single run of that one cell ranges from −6.15 % (seed 13) to
 *     +57.04 % (seed 47). The scene this lesson opens with, seed 2, gives +21.63 %: the reader's
 *     first reading disagrees with the printed table before the lesson says anything.
 *  2. **an instrument that reads nothing.** Slice W12a swept `coherenceMs` over four values and
 *     got four identical rows, because its own probe had `shadowSigmaDb: 0` and `shadowDb`
 *     returns before it reads the coherence time. This lesson SHIPS that pair as two variants —
 *     coherence 5 ms and 500 ms at sigma 0 — and they record the same timeline hash in
 *     `tests/fixtures/lesson-hashes.json`. Per §1 step 2 of `docs/inert-config-contract.md` the
 *     verdict for such a configuration is「pin it」rather than「refuse it」on either of two
 *     grounds, and both hold here: it is a lesson's teaching aid, and its doing nothing is the
 *     fact being taught.
 *  3. **what survives.** The fixed-position arm is exact and seed-free — 39.040 / 29.280 is
 *     624 / 468 to four places over five seeds and two run lengths — so「the finer ladder is
 *     worthless」is refuted by the same scene that casts doubt on the faded figure. What is left
 *     is a conditional claim, and the mechanism under it is the one thing stable across every
 *     batch: in all twenty-four (position × fading × batch) cells measured, the finer ladder's
 *     `RX_FAIL` count is the higher of the two.
 *
 * So the lesson's last word is the shape of a submittable claim, and then the public record of
 * this very ladder: seven contributions behind four rungs, one of which (`11-24/0753r1`) is
 * another company's simulation results — the document Motion #216 cites alongside the original
 * proposal. That is the reader's own activity, in the record, doing the thing the lesson is for.
 *
 * Every figure below is pinned in `tests/course/claim-to-contribution.test.ts` against runs of
 * the scenes this lesson ships, and the corpus figures (8 523 / 618, 7 874 / 712, 143 TBD) are
 * re-counted in `.superpowers/sdd/w13-report.md` §1 rather than copied from the spec.
 */
import { type Lesson, J } from '../lessonKit'
import { uhrLadderScenario } from '../wifiScenes'

export const claimToContribution: Lesson = {
  id: 'claim-to-contribution',
  module: 13,
  title: '同一格换一批种子就换一个数——一份测量要过哪三道闸门，才成得了一份文稿',
  why: '上一课在客厅深处那一格印了一个数：两层起伏都打开之后，细阶梯比粗阶梯快 11.78 %。这一课要问的是那个数靠不靠得住，而答案是它取决于你取了哪一批随机种子：同一格换一批六十个种子算出 7.40 %，换另外六十个是 8.65 %，一百二十个是 6.60 %；而只跑一次，最差的那个种子说细阶梯慢 6.15 %，最好的那个说它快 57.04 %。这一课不教你把种子取多一点，它教你把一份测量分成三类，再说出每一类能写成什么话——因为这条阶梯自己就是这么进草案的，它背后有七份公开文稿，其中一份是另一家公司对它做的仿真结果。',
  outcomes: [
    '把一个仿真结果分成三类——换一批种子还站得住的、只剩量级的、连正负都站不住的——并说出每一类能写成什么话',
    '在报结论之前先核仪器：指出一个场景里写得下、引擎也去读它、而打开它一个记录都不动的字段，并说出它在什么配置下活过来',
    '顺着公开记录走一遍这条阶梯自己的路：从一份提案与一份仿真结果，到动议、到那张收发规范的表、到两轮投票的八千多条意见',
  ],
  needs: ['uhr-rate-ladder', 'fading', 'rate-fallback', 'bianchi-vs-sim'],
  terms: [
    { term: 'letter ballot (LB)', plain: '信函投票：工作组对某一版草案的正式投票，投票人可以逐条款写意见。D1.0 那一轮（LB291）收到 8 523 条意见，落在 618 个条款上；D2.0 那一轮（LB296）是 7 874 条、712 个条款' },
    { term: 'comment resolution (CR)', plain: '意见决议：对一条意见的处置——接受、接受但改措辞，或者否决并写明理由。本机那份 TGbn 语料里以此为题的文稿有 763 份，而提案有 1 682 份' },
    { term: 'TBD (to be determined)', plain: '待定：草案正文里「这一处还没定」的那个标记。规范框架 r19 自己带 143 处，落在它 49 个三级小节里的 26 个；最多的一节是无缝漫游，一节 36 处' },
  ],
  picture: [
    { heading: '那个 11.78 % 是什么的函数', text: '上一课那张起伏表的最后一行印着 +11.78 %，表头也写明了它是二十个种子的均值。问题不在均值上，在于均值本身还是那二十个种子的函数：下面那张表把同一格换成四批不同的种子各算一遍，四个数没有两个相同，而印在课文上的那一批恰好是最高的那一个。所以「这一格快 11.78 %」不是一个命题——它是一个数，加一张没有写出来的种子表。',
    },
    { kind: 'watch', jump: 0, heading: '先去看你自己这一跑给出什么', text: '载入这一课的场景——还是上一课那间长公寓，客厅深处那台一直在上传的笔记本，阴影与瑞利两层都开着，种子 2——跳到第一帧跑在新档上的那一刻，读帧详情里那一行：模式 uhr，调制与编码方式（modulation and coding scheme, MCS）是 5——那一档是一种调制（modulation）配一个码率。再切到「Wi-Fi 7 · 同一格」：eht，MCS 3。两边跑完 300 毫秒，吞吐是 20.240 对 16.640 Mb/s，也就是 +21.63 %。而上一课那张表在同一格印的是 +11.78 %。你刚载入的这一跑，不是那张表。',
    },
    { kind: 'steps', heading: '三道闸门，按顺序', items: [
      '闸门一·换一批，不是换一个。同一格、同一对阶梯，只换随机种子表：四批给出 +11.78、+7.40、+8.65、+6.60 %。所以一个数在这里只能连着它的种子表一起报；而「在六十个种子上复核过」本身不是一个有定义的说法——两批六十个彼此就不一致。',
      '闸门二·先核仪器，再报结论。把阴影的标准差改成 0，再把相干时间从 5 毫秒扫到 500 毫秒：四行输出到小数第六位完全相同。那个字段场景里写得下、引擎也去读它，而它一个结果都改不了——因为算阴影的那一步在标准差为 0 时直接返回 0，还没走到相干时间那一行。',
      '闸门三·问这个结论在什么地方不成立。把两层起伏都关掉，同一格的差是 39.040 对 29.280 Mb/s，正好等于两档每符号（symbol）数据比特数之比 624 / 468，而五个种子、两种跑长给出同一个比值。所以「细阶梯什么也不值」这句话，被同一条链路（link）上的另一次测量直接否掉了。',
    ] },
    { heading: '所以能写的是三句话，不是一句', text: '三类数，按它们能承受的改动分。第一类是定点那个比值：它等于阶梯自己的算术，换种子不动，可以写到最后一位。第二类是客厅中段只开阴影那一格，四批种子给出 +8.18 / +9.19 / +8.19 / +9.43 %，量级稳、正负稳，可以写成「稳稳地快不到一成」。第三类是墙后一步那一格，二十个种子给 −0.04 %、六十个给 +2.10 %，连正负都不在了——这一格能写的只剩机理，而机理恰好是稳的：下面那张表四行乘三个位置共十二格，细阶梯的接收失败数每一格都比粗阶梯高。',
    },
  ],
  numbers: [
    { kind: 'table', heading: '同一格，四批种子（均值之比；括号里是这一批里 Wi-Fi 8 更快的个数）', head: [
      '这一批种子', '墙后一步 · 只阴影', '客厅中段 · 只阴影', '客厅深处 · 两层',
    ], rows: [
      ['二十个', '−0.04 %（8/20）', '+8.18 %（19/20）', '+11.78 %（14/20）'],
      ['六十个质数', '+2.10 %（36/60）', '+9.19 %（59/60）', '+7.40 %（43/60）'],
      ['一到六十', '+1.77 %（31/60）', '+8.19 %（57/60）', '+8.65 %（46/60）'],
      ['一百二十个', '+1.97 %（67/120）', '+9.43 %（118/120）', '+6.60 %（81/120）'],
    ] },
    { heading: '一次跑能告诉你的，和不能告诉你的', text: '上面每一格都是一批种子的均值，而单跑的散布比四批均值之间的散布大得多。客厅深处那一格，二十个种子里最差的是种子 13——Wi-Fi 8 跑 9.160、Wi-Fi 7 跑 9.760 Mb/s，细阶梯慢 6.15 %；最好的是种子 47——18.280 对 11.640，快 57.04 %。而这一课载入的那一跑用的是种子 2，给出 +21.63 %。',
    },
    { kind: 'table', heading: '把阴影关掉之后，相干时间那个旋钮（客厅深处、瑞利开着、300 毫秒、种子 2，Wi-Fi 8 的吞吐）', head: [
      '相干时间', '阴影标准差 0', '阴影标准差 4 分贝',
    ], rows: [
      ['5 毫秒', '17.120000 Mb/s', '13.960 Mb/s'],
      ['20 毫秒', '17.120000 Mb/s', '12.120 Mb/s'],
      ['100 毫秒', '17.120000 Mb/s', '20.240 Mb/s'],
      ['500 毫秒', '17.120000 Mb/s', '28.000 Mb/s'],
    ] },
    { heading: '左边那一列是一个空转的旋钮，而这件事要分两句说', text: '左边四行到小数第六位完全相同，不是近似相同：两边的记录都是 9 472 条，接收失败都是 11 次，而本仓库那份时间轴指纹对「相干 5 毫秒」与「相干 500 毫秒」这两个变体记下的是同一个值。原因在算阴影那一步——标准差为 0 时它直接返回 0，相干时间那一行代码根本走不到。右边那一列是同一个字段在标准差 4 分贝下的样子，从 13.960 走到 28.000 Mb/s。所以它不是一个没用的字段，它是一个在这个配置下读不到的字段。',
    },
    { kind: 'formula', heading: '定点那一臂是算术，不是一次测量的运气', text: '624 / 468 = 1.3333；实测 39.040 / 29.280 = 1.3333。', note: '种子 1、2、7、17、99 五个种子，300 毫秒与 600 毫秒两种跑长，六个组合给出同一个比值。这一臂里没有随机性可言：档是接收电平的函数，电平是几何的函数，一条跑满的单站链路没有东西可碰撞。而「没有随机性」这件事本身也是量出来的，不是假定的。' },
    { kind: 'table', heading: '这条阶梯自己走过的路，全在公开记录里', head: [
      '这一步', '留下的文稿', '它变成了什么',
    ], rows: [
      ['提案', '11-24/0469r0', '四个调制与码率的组合，提给 TGbn'],
      ['仿真结果', '11-24/0753r1', '另一家公司对同一组档位的仿真'],
      ['续篇', '11-24/1186r1', 'Motion #42：四个组合写进规范框架'],
      ['定为必选', '（无新文稿）', 'Motion #216：引的正是上面那两份'],
      ['收发规范', '11-25/0721r3', 'Motion #417 的那张表，引擎读的就是它'],
      ['第一轮意见', '11-25/1772r16', 'D1.0 的 8 523 条，落在 618 个条款上'],
      ['第二轮意见', '11-26/1613r0', 'D2.0 的 7 874 条，落在 712 个条款上'],
    ] },
    { heading: '那张表里最该读的是第二行', text: '把一组档位加进草案的不是一份提案，是一串文稿；而让 Motion #216 把它们定成必选的那一条动议，引的是最初那份提案和另一家公司做的仿真结果——两份并列。你在这一课里做的事（同一个场景跑两臂、换种子、核仪器）和那份文稿做的事是同一件。而草案里还在等这种东西的地方是数得出来的：规范框架 r19 自己有 143 处待定，落在它 49 个三级小节里的 26 个。一个数要走到那里去，先得过上面三道闸门。',
    },
  ],
  deeper: [
    { heading: '为什么「六十个种子」根本不是一个量', text: '两批同样大、同样叫「六十个」的种子表给出不同的答案：客厅深处两层那一格是 +7.40 % 对 +8.65 %，墙后一步只阴影那一格是 +2.10 % 对 +1.77 %，六格里有五格不同。所以「n = 60」说的是样本的大小，不是样本本身，而一句报告里只写大小等于没写量具。要让那句话有定义，得把种子表本身写出来——本课那四批分别是二十个（1 加前十九个质数）、六十个（1 加前五十九个质数）、一到六十、一百二十个（1 加前一百一十九个质数）。' },
    { heading: '连定点那一臂也带着一个条件', text: '墙后一步那一格的算术是 1 248 / 1 170 = 1.0667，而 300 毫秒实测 +7.17 %、600 毫秒实测 +6.71 %。差的那半个百分点不是阶梯，是跑长：300 毫秒结束时最后一组聚合被切断，而两臂切断的位置不一样。所以「等于算术」这句话也带条件——跑得够长才等于。客厅中段与客厅深处那两格在两种跑长下都给 +11.11 % 与 +33.33 %，恰好掩盖了这件事，而这就是为什么第三道闸门要问的是「在什么地方不成立」，不是「成不成立」。' },
  ],
  sources: [
    '四个新档的来路，逐份文稿：11-24/0469r0 是最初那份提案；11-24/0753r1 是另一家公司对同一组档位的仿真结果；11-24/1186r1 是续篇，Motion #42 据它把四个调制与码率组合写进 TGbn 的规范框架 11-24/0209r19；Motion #216 把它们定为必选（同一条动议写明 256-QAM 2/3 对只支持 20 兆赫的设备是可选的），而它引的正是前两份；11-25/0721r3 是收发规范的续篇，Motion #417 的接收灵敏度表出自它，本仿真器读的就是那张表。规范框架里每条动议后面方括号里的编号就是它的参考文献序号，上面五份是逐个解出来再和文稿题目对过的。',
    '两轮信函投票的意见本身：11-25/1772r16 是 P802.11bn D1.0 的意见表，8 523 条意见落在 618 个条款上；11-26/1613r0 是 D2.0 的意见表，7 874 条落在 712 个条款上。两份都是公开记录；本课只引了它们的条款数与意见数，一句原文也没有抄。P802.11bn 是未批准的草案，条号与取值都还可能变动。',
    '「143 处待定」是数出来的：规范框架 11-24/0209r19 全文 2 739 行里 TBD 共 143 处，落在它 49 个三级小节里的 26 个，最多的一节是无缝漫游（36 处）。「1 682 份提案、763 份意见决议文稿」出自同一份语料的目录统计，这两类加上其余十一类文稿正好是它记的 2 767 份。',
    '课文里每一个百分数都是本仿真器跑出来的，不是草案给的。阴影的标准差 4 分贝与 100 毫秒相干时间、按每一帧抽取的瑞利衰落，以及挑档时在所需信噪比之上留的 3 分贝余量，都是本仿真器自己的取值；IEEE Std 802.11-2024 一处也没有规定它们。两条阶梯的每符号空口时间逐位相同，所以这些对照只在量阶梯本身。',
  ],
  limits: [
    { kind: 'model-value', text: '这一课的三类划分是对本仿真器这一套速率控制说的：按一条链路的平均电平定上限，降档要两次连续失败、一次退一个索引，升档要十次连续成功。第二类和第三类之所以分得开，靠的正是这套算法——换一个按每一帧各自的接收质量定上限的算法，哪一格落到哪一类都要重新量一遍。所以「这一格连正负都不在」是这套算法下的结论，不是一句可以搬去评价真实芯片的话。' },
    { kind: 'threshold', text: '「换一批种子」在这个引擎里能做到什么，有一个上限：本仿真器的小尺度起伏是按（种子、发端、收端、帧键）做的纯哈希，不是一条随时间相关的游走，而这正是它可复现的来源。所以换种子换掉的是整张抽签表，不是一次真实实验里那种「同一条信道的另一段时间」。本课那四批种子之间的差有多大，是这个抽签方式的性质，换一个相关的信道模型，四批之间的散布会是另一个数。' },
    { kind: 'out-of-scope', text: '这一课不教怎么设计一次扫描——几个种子、怎么选、置信区间怎么算，这些这里一个字也没有，而且在一个确定的仿真器上「置信区间」这个词本身就要先被解释一遍（《把模型和仿真器并排放》那一课的局限一节已经说过这件事）。本课教的只是对一个已经跑出来的数做分类，以及分类之后那句话能写成什么样。' },
    { kind: 'out-of-scope', text: '公开记录那一侧，本课引的是条款数、意见数、文稿编号与动议编号，没有引任何一句草案或意见的原文，也没有把那些文稿的内容转述成结论。所以不要拿这一课去判断那四个档位该不该进草案——它量的是「一份测量要长成什么样才值得被引用」，而不是那次技术判断本身对不对。' },
  ],
  observe: [
    '在这一课自己的场景里只读三个数：第一帧跑在新档上的那一帧，模式是 uhr、档位 5；切到「Wi-Fi 7 · 同一格」是 eht、档位 3；两边 300 毫秒的吞吐是 20.240 对 16.640 Mb/s。',
    '切到「Wi-Fi 8 · 种子 13」和「Wi-Fi 7 · 种子 13」，同样只读吞吐：9.160 对 9.760 Mb/s。同一格、同一对阶梯，只换了随机种子，快慢就反过来了。',
    '在「阴影关着 · 相干 5 毫秒」和「阴影关着 · 相干 500 毫秒」之间来回切，找一处不同：找不到。两边都是 9 472 条记录、11 次接收失败、17.120 Mb/s。',
  ],
  tryThis: [
    '把「Wi-Fi 8 · 种子 47」和「Wi-Fi 7 · 种子 47」各跑一次：18.280 对 11.640 Mb/s，细阶梯快 57.04 %。现在你手上有同一格的四个答案——种子 2 的 +21.63 %、种子 13 的 −6.15 %、种子 47 的 +57.04 %，和二十个种子的均值 +11.78 %。把四个写成一行，然后说出哪一个你敢放进一份文稿，以及为什么。',
    '在「阴影关着 · 相干 5 毫秒」里把相干时间改成任意一个正数再跑：吞吐一个小数位都不动。再把阴影的标准差从 0 改回 4，同一个字段立刻给出不同的答案（5 毫秒 13.960、100 毫秒 20.240、500 毫秒 28.000 Mb/s）。两步合起来才是「这个字段在这里读不到」的证据；只做前一步，你证明的是「这个字段没用」，而那是一句假话。',
  ],
  quiz: [
    {
      q: '上一课在客厅深处那一格印了 +11.78 %，而本课量到四批种子给出 +11.78 / +7.40 / +8.65 / +6.60 %。最该写进一份文稿的是哪一种说法？',
      options: [
        '就写 +11.78 %，因为那是课文印的那一批，也是读者在页面上点得出来的那一批',
        '取四批的平均 +8.6 %，这样就不依赖某一批种子了',
        '「这一格把纸面上的 +33.3 % 还掉大半，剩下的量级在 7 % 到 12 % 之间，而四批种子没有一批给出同一个数」——数连着它的量具一起报',
      ],
      answer: 2,
      explain: '四批的平均仍然是一个种子表的函数，只是种子表更长；而单报一批会让读者把它当成阶梯的性质。能承受换一批种子的只有量级那一层，所以那句话也只能说到量级。',
    },
    {
      q: '把阴影的标准差设成 0，再把相干时间从 5 毫秒扫到 500 毫秒，四行输出完全相同。这次扫描真正证明的是哪一条？',
      options: [
        '相干时间这个字段对吞吐没有影响',
        '在这个配置下相干时间读不到——算阴影那一步在标准差为 0 时先返回了，所以没走到它；而标准差改回 4 分贝，同一个字段就把答案从 13.960 带到 28.000 Mb/s',
        '阴影这一层在本仿真器里根本没有接上',
      ],
      answer: 1,
      explain: '第一条和第三条都把「这一次读不到」当成了「它不起作用」。分辨这两件事只要一步：换一个仍然合法的配置，看同一个字段在那里读不读得到。读得到，那就是接线对了而这次扫描摆错了；读不到，才是它真的在空转。',
    },
  ],
  scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 2 }),
  variants: [
    { label: 'Wi-Fi 7 · 同一格', scenario: () => uhrLadderScenario('eht', 'far', 'both', { seed: 2 }) },
    { label: 'Wi-Fi 8 · 种子 13', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 13 }) },
    { label: 'Wi-Fi 7 · 种子 13', scenario: () => uhrLadderScenario('eht', 'far', 'both', { seed: 13 }) },
    { label: 'Wi-Fi 8 · 种子 47', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 47 }) },
    { label: 'Wi-Fi 7 · 种子 47', scenario: () => uhrLadderScenario('eht', 'far', 'both', { seed: 47 }) },
    { label: 'Wi-Fi 8 · 阴影关着 · 相干 5 毫秒', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: 5 }) },
    { label: 'Wi-Fi 8 · 阴影关着 · 相干 500 毫秒', scenario: () => uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: 500 }) },
    { label: 'Wi-Fi 8 · 不起伏', scenario: () => uhrLadderScenario('uhr', 'far') },
    { label: 'Wi-Fi 7 · 不起伏', scenario: () => uhrLadderScenario('eht', 'far') },
  ],
  jumps: [
    J('第一帧跑在那个新档上', (r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mode === 'uhr' && r.frame.mcs === 5),
    J('第一次接收失败', (r) => r.type === 'RX_FAIL'),
    J('第一次掉出那个新档', (r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined && r.frame.mcs < 5),
    J('第一次抽到一个深阴影', (r) => r.type === 'RX_START' && r.shadowDb !== undefined && r.shadowDb < -4),
  ],
}
