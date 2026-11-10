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
  title: '同一位置换一批种子就换一个结果——一份测量要通过哪三项检验，才能成为一份文稿',
  why: '上一课在客厅深处那个位置给出了一个数：两层起伏都打开之后，细阶梯比粗阶梯快 11.78 %。这一课要问的是那个数是否可靠，而答案是它取决于你选取了哪一批随机种子：同一位置换一批六十个种子算出 7.40 %，换另外六十个是 8.65 %，一百二十个是 6.60 %；而只运行一次，最差的那个种子给出细阶梯慢 6.15 %，最好的那个给出快 57.04 %。所以一个均值只能与它的种子表一起报告，「在六十个种子上复核过」本身没有明确定义；增加种子数也解决不了这个问题，两批同样是六十个的种子彼此就不一致。一个数能写成什么样的结论，要看它能经受什么改动：关闭起伏后的定点比值等于两档每符号（symbol）数据比特数之比，在这个位置更换种子、更换运行时长都不变，可以写到最后一位；客厅中段只开启阴影的那一项，四批种子都稳定地快不到一成，能写的是量级；墙后一步那一项连正负都随种子翻转，能写的只剩机理——而机理是稳定的，细阶梯的接收失败在每一项中都更多。报告结论之前还要先核查测量工具：阴影的标准差为零时，相干时间那个字段可以写入、引擎也会读取，从几毫秒扫描到几百毫秒，输出却完全相同，因为计算阴影的那一步在读取它之前就已返回；标准差一旦不为零，它就重新起作用。这条阶梯本身也是这样进入草案的：一份提案和另一家公司对同一组档位的仿真结果，被将其定为必选的那条动议并列引用，之后又经过了两轮各有七八千条意见的投票。',
  outcomes: [
    '把仿真结果分为三类——更换一批种子仍然成立的、只有量级成立的、连正负都不成立的——并说出每一类能写成什么样的结论',
    '在报告结论之前先核查测量工具：指出一个场景中可以写入、引擎也会读取、而改变它却不影响任何一条记录的字段，并说出它在什么配置下重新起作用',
    '沿着公开记录梳理这条阶梯本身的形成过程：从一份提案与一份仿真结果，到动议、到那张收发规范的表、到两轮投票的八千多条意见',
  ],
  needs: ['uhr-rate-ladder', 'fading', 'rate-fallback', 'bianchi-vs-sim'],
  terms: [
    { term: 'letter ballot (LB)', plain: '信函投票：工作组对某一版草案的正式投票，投票人可以针对各条款提出意见。D1.0 那一轮（LB291）收到 8 523 条意见，涉及 618 个条款；D2.0 那一轮（LB296）是 7 874 条、712 个条款' },
    { term: 'comment resolution (CR)', plain: '意见决议：对一条意见的处置——接受、修改措辞后接受，或者拒绝并写明理由。本地那份 TGbn 语料中以此为题的文稿有 763 份，而提案有 1 682 份' },
    { term: 'TBD (to be determined)', plain: '待定：草案正文里「这一处还没定」的那个标记。规范框架 r19 本身有 143 处，分布在它 49 个三级小节中的 26 个；最多的一节是无缝漫游，有 36 处' },
  ],
  picture: [
    { heading: '那个 11.78 % 是什么的函数', text: '上一课那张起伏表的最后一行给出 +11.78 %，表头也写明了它是二十个种子的均值。问题不在均值本身，而在于均值仍然是那二十个种子的函数：下面那张表在同一位置用四批不同的种子各计算一遍，四个数两两不同，而课文中给出的那一批恰好是最高的。所以「这个位置快 11.78 %」不是一个完整的命题——它是一个数，外加一张没有写出来的种子表。',
    },
    { kind: 'watch', jump: 0, heading: '先查看你自己这一次运行给出的结果', text: '载入这一课的场景——还是上一课那间长公寓，客厅深处那台持续上传的笔记本，阴影与瑞利两层都开启，种子 2——跳到第一帧使用新档发送的时刻，读取帧详情里那一行：模式 uhr，调制与编码方式（modulation and coding scheme, MCS）是 5——一档就是一种调制（modulation）与一种码率的组合。再切换到「Wi-Fi 7 · 同一位置」：eht，MCS 3。两边运行 300 毫秒，吞吐是 20.240 对 16.640 Mb/s，也就是 +21.63 %。而上一课那张表在同一位置给出的是 +11.78 %。你刚载入的这一次运行，并不是那张表中的结果。',
    },
    { kind: 'steps', heading: '三项检验，按顺序', items: [
      '检验一·更换一批种子，而不是一个。同一位置、同一对阶梯，只更换随机种子表：四批给出 +11.78、+7.40、+8.65、+6.60 %。所以一个数在这里只能与它的种子表一起报告；而「在六十个种子上复核过」本身不是一个有明确定义的说法——两批六十个种子彼此就不一致。',
      '检验二·先核查测量工具，再报告结论。把阴影的标准差改为 0，再把相干时间从 5 毫秒扫描到 500 毫秒：四行输出到小数点后第六位完全相同。那个字段可以写入场景、引擎也会读取，而它不改变任何结果——因为计算阴影的那一步在标准差为 0 时直接返回 0，还没有执行到相干时间那一行。',
      '检验三·问这个结论在什么条件下不成立。把两层起伏都关闭，同一位置的结果是 39.040 对 29.280 Mb/s，比值正好等于两档每符号（symbol）数据比特数之比 624 / 468，而五个种子、两种运行时长给出同一个比值。所以「细阶梯毫无价值」这句话，被同一条链路（link）上的另一次测量直接否定了。',
    ] },
    { heading: '所以能写出的是三句话，而不是一句', text: '三类数，按它们能经受的改动来划分。第一类是定点那个比值：它等于阶梯本身的计算值，更换种子也不变，可以写到最后一位。第二类是客厅中段只开启阴影的那一项，四批种子给出 +8.18 / +9.19 / +8.19 / +9.43 %，量级稳定、正负稳定，可以写成「稳定地快不到一成」。第三类是墙后一步那一项，二十个种子给出 −0.04 %、六十个给出 +2.10 %，连正负都无法确定——这一项能写的只剩机理，而机理恰好是稳定的：下面那张表四行乘三个位置共十二格，细阶梯的接收失败数每一格都比粗阶梯高。',
    },
  ],
  numbers: [
    { kind: 'table', heading: '同一位置，四批种子（均值之比；括号内是这一批中 Wi-Fi 8 更快的个数）', head: [
      '种子批次', '墙后一步 · 仅阴影', '客厅中段 · 仅阴影', '客厅深处 · 两层',
    ], rows: [
      ['二十个', '−0.04 %（8/20）', '+8.18 %（19/20）', '+11.78 %（14/20）'],
      ['六十个质数', '+2.10 %（36/60）', '+9.19 %（59/60）', '+7.40 %（43/60）'],
      ['一到六十', '+1.77 %（31/60）', '+8.19 %（57/60）', '+8.65 %（46/60）'],
      ['一百二十个', '+1.97 %（67/120）', '+9.43 %（118/120）', '+6.60 %（81/120）'],
    ] },
    { heading: '单次运行能说明什么，不能说明什么', text: '上面每一格都是一批种子的均值，而单次运行的离散程度比四批均值之间的离散程度大得多。客厅深处那个位置，二十个种子中最差的是种子 13——Wi-Fi 8 为 9.160、Wi-Fi 7 为 9.760 Mb/s，细阶梯慢 6.15 %；最好的是种子 47——18.280 对 11.640，快 57.04 %。而这一课载入的那次运行用的是种子 2，给出 +21.63 %。',
    },
    { kind: 'table', heading: '关闭阴影之后的相干时间参数（客厅深处、瑞利衰落开启、300 毫秒、种子 2，Wi-Fi 8 的吞吐）', head: [
      '相干时间', '阴影标准差 0', '阴影标准差 4 分贝',
    ], rows: [
      ['5 毫秒', '17.120000 Mb/s', '13.960 Mb/s'],
      ['20 毫秒', '17.120000 Mb/s', '12.120 Mb/s'],
      ['100 毫秒', '17.120000 Mb/s', '20.240 Mb/s'],
      ['500 毫秒', '17.120000 Mb/s', '28.000 Mb/s'],
    ] },
    { heading: '左边那一列对应一个不起作用的参数，而这件事要分两句说', text: '左边四行到小数点后第六位完全相同，而不是近似相同：两边的记录都是 9 472 条，接收失败都是 11 次，而本仓库那份时间轴指纹对「相干 5 毫秒」与「相干 500 毫秒」这两个变体记录的是同一个值。原因在于计算阴影的那一步——标准差为 0 时它直接返回 0，根本不会执行到相干时间那一行代码。右边那一列是同一个字段在标准差 4 分贝下的结果，从 13.960 变化到 28.000 Mb/s。所以它不是一个无用的字段，而是一个在这个配置下不会被读取的字段。',
    },
    { kind: 'formula', heading: '定点那一臂的结果是确定的计算值，而不是一次测量的偶然结果', text: '624 / 468 = 1.3333；实测 39.040 / 29.280 = 1.3333。', note: '种子 1、2、7、17、99 五个种子，300 毫秒与 600 毫秒两种运行时长，十个组合给出同一个比值。这一臂中不存在随机性：档是接收电平的函数，电平是几何位置的函数，一条满负荷的单站链路不会发生碰撞。而「不存在随机性」这一点本身也是经过测量验证的，而不是假定的。' },
    { kind: 'table', heading: '这条阶梯本身的形成过程，全部记录在公开文件中', head: [
      '步骤', '相应文稿', '结果',
    ], rows: [
      ['提案', '11-24/0469r0', '四个调制与码率的组合，提交给 TGbn'],
      ['仿真结果', '11-24/0753r1', '另一家公司对同一组档位的仿真'],
      ['续篇', '11-24/1186r1', 'Motion #42：四个组合写进规范框架'],
      ['定为必选', '（无新文稿）', 'Motion #216：引用的正是上面那两份'],
      ['收发规范', '11-25/0721r3', 'Motion #417 的那张表，引擎读取的就是它'],
      ['第一轮意见', '11-25/1772r16', 'D1.0 的 8 523 条，涉及 618 个条款'],
      ['第二轮意见', '11-26/1613r0', 'D2.0 的 7 874 条，涉及 712 个条款'],
    ] },
    { heading: '那张表中最值得注意的是第二行', text: '把一组档位加入草案的不是一份提案，而是一系列文稿；而 Motion #216 这条将它们定为必选的动议，引用的是最初那份提案和另一家公司做的仿真结果——两份并列。你在这一课里做的事（同一个场景运行两臂、更换种子、核查测量工具）和那份文稿做的事是同一类工作。而草案中仍在等待这类工作的地方是可以统计的：规范框架 r19 本身有 143 处待定，分布在它 49 个三级小节中的 26 个。一个数要进入这样的文件，必须先通过上面三项检验。',
    },
  ],
  deeper: [
    { heading: '为什么「六十个种子」根本不是一个量', text: '两批同样大小、同样称为「六十个」的种子表给出不同的答案：客厅深处两层那一项是 +7.40 % 对 +8.65 %，墙后一步仅阴影那一项是 +2.10 % 对 +1.77 %，六格两两对比，没有一对相同。所以「n = 60」描述的是样本的大小，而不是样本本身，一句报告中只写样本大小，就等于没有说明测量条件。要让那句话有明确定义，必须把种子表本身写出来——本课那四批分别是二十个（1 加前十九个质数）、六十个（1 加前五十九个质数）、一到六十、一百二十个（1 加前一百一十九个质数）。' },
    { heading: '即使是定点那一臂也有一个前提条件', text: '墙后一步那个位置的计算值是 1 248 / 1 170 = 1.0667，而 300 毫秒实测 +7.17 %、600 毫秒实测 +6.71 %。相差的那半个百分点并非来自阶梯，而是来自运行时长：300 毫秒结束时最后一组聚合被截断，而两臂截断的位置不同。所以「等于计算值」这句话也有前提——运行时间足够长才成立。客厅中段与客厅深处那两个位置在两种运行时长下都给出 +11.11 % 与 +33.33 %，恰好掩盖了这一点，这就是为什么第三项检验要问的是「在什么条件下不成立」，而不是「是否成立」。' },
  ],
  sources: [
    '四个新档的来源，逐份文稿列出：11-24/0469r0 是最初那份提案；11-24/0753r1 是另一家公司对同一组档位的仿真结果；11-24/1186r1 是续篇，Motion #42 据它把四个调制与码率组合写进 TGbn 的规范框架 11-24/0209r19；Motion #216 把它们定为必选（同一条动议写明 256-QAM 2/3 对只支持 20 兆赫的设备是可选的），而它引用的正是前两份；11-25/0721r3 是收发规范的续篇，Motion #417 的接收灵敏度表出自它，本仿真器读取的就是那张表。规范框架里每条动议后面方括号里的编号就是它的参考文献序号，上面五份是逐一解析出来并与文稿题目核对过的。',
    '两轮信函投票的意见本身：11-25/1772r16 是 P802.11bn D1.0 的意见表，8 523 条意见涉及 618 个条款；11-26/1613r0 是 D2.0 的意见表，7 874 条涉及 712 个条款。两份都是公开记录；本课只引用了它们的条款数与意见数，没有摘录任何原文。P802.11bn 是未批准的草案，条号与取值都还可能变动。',
    '「143 处待定」是逐一统计得出的：规范框架 11-24/0209r19 全文 2 739 行里 TBD 共 143 处，分布在它 49 个三级小节中的 26 个，最多的一节是无缝漫游（36 处）。「1 682 份提案、763 份意见决议文稿」出自同一份语料的目录统计，这两类加上其余十一类文稿正好是它记录的 2 767 份。',
    '课文里每一个百分数都是本仿真器运行得出的，不是草案给出的。阴影的标准差 4 分贝与 100 毫秒相干时间、按每一帧抽取的瑞利衰落，以及选档时在所需信噪比之上留的 3 分贝余量，都是本仿真器自己的取值；IEEE Std 802.11-2024 没有任何一处规定它们。两条阶梯的每符号空口时间逐位相同，所以这些对照只测量阶梯本身。',
  ],
  limits: [
    { kind: 'model-value', text: '这一课的三类划分是针对本仿真器这一套速率控制而言的：按一条链路的平均电平确定上限，降档需要连续失败两次、一次降一个索引，升档需要连续成功十次。第二类和第三类之所以能够区分，依靠的正是这套算法——换成一个按每一帧各自的接收质量确定上限的算法，每一项归入哪一类都要重新测量。所以「这一项连正负都无法确定」是这套算法下的结论，不是一句可以用来评价真实芯片的话。' },
    { kind: 'threshold', text: '「换一批种子」在这个引擎里能做到什么，有一个上限：本仿真器的小尺度起伏是按（种子、发端、收端、帧键）做的纯哈希，而不是一个随时间相关的随机过程，这正是它可复现的原因。所以更换种子更换的是整张随机抽取表，而不是一次真实实验中那种「同一条信道的另一段时间」。本课那四批种子之间的差异有多大，取决于这种抽取方式，换成一个时间相关的信道模型，四批之间的离散程度会是另一个数值。' },
    { kind: 'out-of-scope', text: '这一课不讲如何设计一次扫描——用几个种子、如何选取、置信区间如何计算，这里都没有涉及，而且在一个确定性的仿真器上，「置信区间」这个词本身就需要先加以解释（《把模型和仿真器并排放》那一课的局限一节已经说过这件事）。本课讲的只是对一个已经得到的数进行分类，以及分类之后这个结论能写成什么样。' },
    { kind: 'out-of-scope', text: '公开记录那一侧，本课引用的是条款数、意见数、文稿编号与动议编号，没有引用任何一句草案或意见的原文，也没有把那些文稿的内容转述成结论。所以不要用这一课去判断那四个档位是否应该进入草案——它讨论的是「一份测量要具备什么条件才值得被引用」，而不是那次技术判断本身是否正确。' },
  ],
  observe: [
    '在这一课自己的场景里只读取三个数：第一帧使用新档发送的帧，模式是 uhr、档位 5；切换到「Wi-Fi 7 · 同一位置」是 eht、档位 3；两边 300 毫秒的吞吐是 20.240 对 16.640 Mb/s。',
    '切换到「Wi-Fi 8 · 种子 13」和「Wi-Fi 7 · 种子 13」，同样只读取吞吐：9.160 对 9.760 Mb/s。同一位置、同一对阶梯，只更换了随机种子，快慢就反转了。',
    '在「关闭阴影 · 相干 5 毫秒」和「关闭阴影 · 相干 500 毫秒」之间来回切换，寻找不同之处：找不到。两边都是 9 472 条记录、11 次接收失败、17.120 Mb/s。',
  ],
  tryThis: [
    '把「Wi-Fi 8 · 种子 47」和「Wi-Fi 7 · 种子 47」各运行一次：18.280 对 11.640 Mb/s，细阶梯快 57.04 %。现在你得到了同一位置的四个答案——种子 2 的 +21.63 %、种子 13 的 −6.15 %、种子 47 的 +57.04 %，和二十个种子的均值 +11.78 %。把四个写在同一行，然后说出你愿意把哪一个写进一份文稿，以及原因。',
    '在「关闭阴影 · 相干 5 毫秒」里把相干时间改为任意一个正数再运行：吞吐的每一位小数都不变。再把阴影的标准差从 0 改回 4，同一个字段立即给出不同的结果（5 毫秒 13.960、100 毫秒 20.240、500 毫秒 28.000 Mb/s）。两步合在一起才是「这个字段在这里不会被读取」的证据；只做前一步，你证明的是「这个字段没有用」，而那是一个错误的结论。',
  ],
  quiz: [
    {
      q: '上一课在客厅深处那个位置给出 +11.78 %，而本课测得四批种子给出 +11.78 / +7.40 / +8.65 / +6.60 %。最该写进一份文稿的是哪一种说法？',
      options: [
        '就写 +11.78 %，因为那是课文给出的那一批，也是读者在页面上能够查到的那一批',
        '取四批的平均 +8.6 %，这样就不依赖某一批种子',
        '「这个位置失去了理论值 +33.3 % 的大半，剩余收益的量级在 6 % 到 12 % 之间，而四批种子给出的数各不相同」——数值要与其测量条件一起报告',
      ],
      answer: 2,
      explain: '四批的平均仍然是一个种子表的函数，只是种子表更长；而只报告一批会让读者把它当成阶梯的性质。能经受更换种子批次的只有量级这一层，所以那句话也只能说到量级。',
    },
    {
      q: '把阴影的标准差设成 0，再把相干时间从 5 毫秒扫到 500 毫秒，四行输出完全相同。这次扫描真正证明的是哪一条？',
      options: [
        '相干时间这个字段对吞吐没有影响',
        '在这个配置下相干时间不会被读取——计算阴影的那一步在标准差为 0 时提前返回，所以没有执行到它；而标准差改回 4 分贝，同一个字段就使结果从 13.960 变化到 28.000 Mb/s',
        '阴影这一层在本仿真器里根本没有接入',
      ],
      answer: 1,
      explain: '第一条和第三条都把「这一次不会被读取」当成了「它不起作用」。区分这两种情况只需一步：换一个仍然合法的配置，看同一个字段在那里是否会被读取。会被读取，说明接入正确，是这次扫描的配置不当；不会被读取，才说明它确实不起作用。',
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
