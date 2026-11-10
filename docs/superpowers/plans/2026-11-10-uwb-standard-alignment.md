# UWB 对齐标准：引擎改正 + 课程重排（2026-11-10 起）

## 目标

1. 把 `docs/uwb-standard-audit.md` 列出的 24 处「引擎与标准不一致」改成标准（或草案）的做法。
2. 同时把 34 门 UWB 课改成新结构：**① 标准怎么规定 → ② 本仿真器怎么实现 → ③ 动手仿真**，
   课末「这一课的模型在哪里不是真实的无线电」（`limits`）一节取消，内容并入 ②。

用户的决定（2026-11-10）：「why don't you fix the engine discrepancies while you adjust the course
structure. you're going to change the content anyway」——引擎改了，课文里的数一定要重写，所以每门课
只重写一次：引擎改到位之后，按新结构写那门课。

## 不变的规矩

- 严禁把仿真器的实现与标准混淆（记忆 `standard-vs-simulator`）。② 里每一条都要写明是
  「照标准」「本仿真器取的值」「本仿真器的取法（标准未规定）」「本仿真器与标准不同」还是「未实现」。
- 标准写法用标准的书面中文（措辞契约 §11）。
- 引擎改动改变场景结果，所以 fixture（`tests/fixtures/lesson-hashes.json`、`uwb-record-hashes.json`）
  **会**重新生成——每一次都要写明是哪一处引擎改正引起的，不许为了让测试变绿而重生成。
- 每个阶段结束：tsc 干净、vitest 全绿、提交。

## 硬规则：不许自创标准里没有的东西（用户 2026-11-10）

「how could you invent information element... if standard does not have it, you DONT invent yourself」。
标准里没有的信息单元、字段、帧、消息、规则，引擎里一律不许有——**标注成「本仿真器自己的」也不行**。
一个机制若需要标准没有提供的信息，就按标准的做法实现（用标准定义的帧与信息单元），
做不到就不实现，并在 ② 里写「未实现」。② 里的「本仿真器的取值／取法」只限于标准**明确留给实现**的地方
（标准说「不规定」「由上层决定」的取值、接收机的判决方法等），不能用来给自创的协议元素开口子。

现有的自创元素（全部要从引擎里去掉）：

| 自创元素 | 用在 | 改成 |
| --- | --- | --- |
| `TXT` 发送时刻 IE、`RXT` 接收时刻 IE | ~~多对多~~（W3 已去掉）、~~DL-TDoA~~（W4 已去掉） | 多对多按 §10.32.6／.7 用 RRMC／RRTI／RMI（W3）；DL-TDoA 按标准的同步节点方案，不需要这两个 IE（**W4 已去掉**）。两条合并后 src/ 里已无这两个 IE |
| `COFF` 时钟偏差 IE | DL-TDoA | 标准的第二种 TDoA 情形是彼此同步的固定节点按已知偏移广播，不需要（**W4 已去掉**） |
| `BLINK` IE | UL-TDoA | 闪发是普通的短帧（§10.29.1.2.5，典型最短为 12 字节的多用途帧），没有专门的 IE（**W4 已去掉**：12 字节的多用途帧） |
| `RAOA` 作为 IE | SP3 报告 | RAOA 是 SRRR 里的请求位；到达角结果放在 RMI IE 的到达角字段里（§10.29.8.4）（**W4 已改正**） |
| 地址只有、没有测量的 RMI | 延后 DS-TWR 的 Final | 标准的延后 Final 不带 IE；RMI 至少要有一项测量（§10.29.8.4） |

同理，自创的**规则**也要去掉：竞争的反馈与空过（已去掉）、3 RSTU 整数倍、按块计的有效期、把延后 DS 的两个时间扣在发起方等。

## 第一阶段：新结构与试点（第 70 课）

1. `Lesson` 增加三个可选字段：`standard: Block[]`（① 标准）、`implementation: ImplItem[]`（②）、
   `labs: Lab[]`（③）。`ImplItem` = { 话题, 标准怎么说（简短、带条款）, 本仿真器怎么做, 类别 }；
   类别 ∈ 照标准 / 取值 / 取法 / 不同 / 未实现。`Lab` = { 标题, 载入哪个变体, 跳到哪里,
   操作步骤, 你应该看到什么, 这说明什么（指回 ① 或 ②） }。
2. 课程面板：有 `standard` 的课按新结构渲染（摘要·能做什么·前置·术语 → ① → ② → ③ → 测验 → 出处折叠），
   不再渲染 picture／numbers／deeper／observe／tryThis／limits。没有迁移的课照旧。
3. 引擎：竞争式测距按 §10.32.9.6 改——尝试上限只在一个测距轮次组内计数、没有反馈、取消空过；
   上限不得超过有效轮数（编辑器校验）。
4. 第 70 课按新结构重写；在折叠屏两种宽度下用浏览器检查。

## 第二阶段：引擎对齐（按子系统，每个子系统连同它影响的课一起改）

| 工作流 | 不一致项（审计编号） | 影响的课（主要） |
| --- | --- | --- |
| W1 会话结构 | #23 有效轮数不跨块（块内多轮、测距轮次组）、#9 ARC/RR IE 内容、#13 RCPS 阶段表、#10 取消 3 RSTU 规则、#1 竞争（余下部分） | blocks、slot-budget、rcm-validity、contention、receipt、ancillary 系列 |
| W2 帧与信息单元 | #7 PHR 21 符号、#8 IE 内容头、#4 延后 SS 用 RMI、#3 延后 DS 把时间发给应答方并由应答方计算、#5 固定回复时间 FRTi（RMARKER 到 RMARKER、每个应答方一个值、RRTN）、#11/#24 收妥位图按时隙 + 长度字节、#12 RAICT 位与辅助信息轮、#14 SRRR 成对四位 | frame、sstwr、dstwr、reply-time、deferred-ds、receipt、sp3、ancillary 系列 |
| W3 多对多 | #2 按 §10.32.6/.7：发起方与应答方分开，M + N 帧得 M×N 对 | m2m、receipt |
| W4 单向测距与到达角 | #15 DL-TDoA 按标准的第二种情形（同步的固定节点按已知偏移广播）、#16 单边测距时用 RMI 的 TOF 字段 | dl-tdoa、ul-tdoa、aoa |
| W5 4ab 草案 | #6 预测回复时间取代固定回复时间与反序、#17 SP0 只计一次、#18 RSF 带 SFD 与 SP0、#19 先听后发按法规与按时隙退避、#20 感知时长、#22 交织片段间隔 | mms、mms-numbers、nba、nba-coexist、ssbd、uwbd、acquisition、subrounds、capstone |
| W6 Wi-Fi | #21 能量检测按主 20 MHz | coexist、nba-coexist，以及 Wi-Fi 侧用到能量检测的课 |

顺序：W1 是地基，先做；W2、W5、W6 可并行；W3、W4 在 W2 之后。

## 第三阶段：其余的课按新结构重写

第二阶段里没被任何工作流覆盖到的课（intro、position、geometry、coexist、sensing 等）按新结构重写。

## 进度

- [x] 第一阶段（试点第 70 课，见提交记录；等用户看过新结构再铺开）
- [x] W1（引擎部分；受影响的课尚未改成新结构）　- [x] W2（引擎部分，见 `docs/superpowers/specs/2026-11-10-uwb-frames-ies-design.md`；课只改到不再说错）　- [x] W3（见 `docs/superpowers/specs/2026-11-11-w3-design.md`）　- [x] W4（见 `docs/superpowers/specs/2026-11-11-w4-design.md`）　- [x] W5（见 `docs/superpowers/specs/2026-11-11-w5-draft-items-design.md`）　- [ ] W6
- [x] 34 门 UWB 课全部改成新结构（① 标准 → ② 本仿真器怎么实现 → ③ 动手仿真）。依赖 W3–W6 的课，② 里把尚未改正的引擎行为标为「与标准不同」
- [ ] 第三阶段（Wi-Fi 与 AMP 课程）
- [x] W2b（除一对多窄带 POLL 长度外，见 `docs/superpowers/specs/2026-11-11-w2b-design.md`）
- [x] W7a Wi-Fi MAC 帧、确认与保护：见姊妹计划 `docs/superpowers/plans/2026-11-11-wifi-standard-alignment.md`

## 改课时新发现的引擎偏差（W2b，待改）

| 偏差 | 标准 | 影响的课 |
| --- | --- | --- |
| ~~应答方的时隙取自场景配置，不取自收到的 RDM 信息单元；没收到控制消息的锚点照样在时隙里接收~~ **已改正（W2b）** | §10.32.9.8 | blocks、rcm-validity |
| ~~一个块不一定装整数个轮（删一个锚点后 200 ms 块装 12 个 16 ms 轮，余 8 ms）~~ **已改正（W2b）**：轮长取能整除块的最小时隙数 | §10.32.2 | blocks |
| ~~300 RSTU 的最短时隙是本仿真器自定的规则~~ **已改正（W2b）**：改为最长帧 + 飞行余量 + aTurnaroundTime | 标准没有 | slot-budget |
| ~~DS-TWR：Treply1 应在 Response 的 RRTI 里送回，报告里只放 Tround2~~ **已改正（W2b）**；延后形态的报告带 TOF（图 10-206） | 图 10-238 | dstwr、deferred-ds |
| SS-TWR 的 Response 带 RRMC：**核实（W2b）**，一对多的图 10-235 里应答带 RRTI 与 RRMC (1)，本仿真器照此；图 10-204 是一对一 | §10.32.4 | sstwr、intro |
| ~~「序列关闭」仍按配置 1 的帧长~~ **已改正（W2b）**：配置 0 | 表 16-1 | sts |
| ~~一对多窄带 POLL 算成 14 + 3N 字节；提案表 1.6.3.1 合计 12 + 3N~~ **W5 已改正**：12 + 3N（草案 Figure 90 同样三个字段，15-24/0687r4） | 15-22/0381r5 | nba、mms |
| ~~RMNR 在静态场景里永远不会发出~~ **已解决（W2b）**：rcm-validity 第三个场景加入 Wi-Fi 干扰，持有控制消息的锚点漏收启动消息时发出 RMNR | §10.34 | rcm-validity |
