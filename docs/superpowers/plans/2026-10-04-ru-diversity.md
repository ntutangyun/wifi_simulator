# 资源单元粒度的频率分集 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个 OFDMA 成员按**它那一片资源单元**的格数判决，而不是整条信道的格数。

**Architecture:** 切片 4a 已经把信道按 26 音调资源单元分格、按容量合成有效信噪比。
这一刀只改一个已经在走的分支：`selCombine` 先问这一次接收属于哪一个成员、它占多少，
再只读那一段格号。新增两个纯函数、两个帧字段、两个记录字段，**一个新常数都不加**。

**Tech Stack:** TypeScript、Vitest、zod。确定性引擎（整数纳秒、`splitmix32`、记录即真相）。

**Spec:** `docs/superpowers/specs/2026-10-04-ru-diversity-design.md`（854 行）。
**每个任务都要读它点名的那一节**，数值与措辞照抄，不要重算。

## Global Constraints

- **`LimitKind` 恰好四个**：`threshold | unmodelled | model-value | out-of-scope`。**`regulation` 不是。**
- **不许把标准／草案正文抄进仓库**；条号、字段名、数值可以。
- **每个常数标出处**：`standard §x` / `standard be §x` / `4ab draft …` / `FiRa` / `model` / `physics`。
- **`tests/fixtures/lesson-hashes.json` 与 `uwb-record-hashes.json` 只许增行。**
  **Task 1–4 必须零 diff**；只有 Task 5 允许跑一次 `UPDATE_HASHES=1`，跑完逐行确认只有新增。
- **份额从 `ruFraction` 读，不许数 `muParts.length`**（规格 §4.5.4）。
- **这一刀只做 OFDMA 那一路**，MU-MIMO 的数一个都不许动，而且要有断言证明它没动。
- 课文中文、全角标点；`wording.test.ts` 与 `readability.test.ts` 无豁免名单，
  **首次出现规则是位置性的**（英文名在首次使用处 40 字以内）；禁词含「惩罚」与买卖类语域。
- 提交**只用显式路径**；不要 `-a`／`--amend`／`git reset`／裸 `stash`。末尾两行：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 与
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`。
- 验证 `npx tsc -b --force`（`tsc -b` 会缓存）与 `npx vitest run`。
- **临时探针放 scratchpad**，用 `vite-node --root <worktree>` 跑，**不要在 `tests/` 下建临时文件**。

---

### Task 1: 两个纯函数，以及 4a 那处出处标错

**Files:** Modify `src/engine/selectivity.ts`；Test `tests/engine/selectivity.test.ts`

**规格：§6.1、§2.1–§2.4、§0.3。**

**Interfaces — Produces:**

    export function selMemberBins(widthMhz: number, ruFraction: number): number
    export function selBinStart(widthMhz: number, fractions: readonly number[], idx: number): number

- [ ] **Step 1:** 写失败测试：**十五个 (带宽, 成员数) 组合全部列出**，断言 `selMemberBins`
  与规格 §2.1 那张表逐格相同，并**单独标出三个非整数的那一行**（(20,2)、(20,4)、(40,4)）。
  **十二行取整无效果要在测试里看得见**（§8 第 3 条），否则下一个人会以为取整是普遍的。
- [ ] **Step 2:** 跑它，确认失败（函数不存在）。
- [ ] **Step 3:** 实现。**截到整数的依据是音调表**（Table 27-8 / 27-9），
  **这句必须写在函数注释里**，否则会被读成一次凑整；**下限 1** 是物理下限
  （一个 26 音调资源单元恰好一格，`standard be §9.4.1.75` 的回报单位），不是防御性取值。
  **一个新常数都不加**（`RU26_PER_20MHZ`、`DF_EHT_KHZ` 已在）。
- [ ] **Step 4:** 顺手修 §0.3：这个文件把三个常数标成 `standard §9.4.1.75`，
  **而 IEEE Std 802.11-2024 里不存在这个条号**（9.4.1 到 `.71` 结束，全文零命中；
  控制者已独立核过两份语料）。改成 **`standard be §9.4.1.75`**（同文件一行之外已有
  `standard be Table 36-18` 这个写法）。并把该条给出的依据写进注释：
  `Ncqi` = 9×（B0=0）／18×（B0=1）、**RU 19/56/93/130 不计入回报**，
  于是可回报格数 36/72/144 —— **`selBins(w) = 9w/20` 第一次有了字面依据**。
- [ ] **Step 5:** `npx tsc -b --force` + `npx vitest run tests/engine`。**fixture 零 diff。**
- [ ] **Step 6:** 提交（显式路径）。

---

### Task 2: `selCombine` 先问成员那一份，记录多两个字段

**Files:** Modify `src/engine/channel.ts`、`src/model/records.ts`、`src/ui/format.ts`；
Test `tests/engine/selectivity.test.ts`、`tests/engine/selectivity-round.test.ts`

**规格：§6.2、§6.4、§4.5.6、§8 第 1／2／4 条。**

**Interfaces — Consumes:** Task 1 的 `selMemberBins` / `selBinStart`。

- [ ] **Step 1:** 写失败测试三组：
  **(a) MU-MIMO 没动** —— `mumimoScenario(true)` 上断言 `muKind: 'mumimo'` 的 PPDU
  `bins` **仍等于整条信道的格数**、`ruFraction` 字段**不出现**（基线量过：1824 条全部 `bins = 72`）。
  **要断言它没变，而不是不管它。**
  **(b) 位置那两条**（§8 第 4 条）：确定性（同种子重跑 `binStart` 逐字段相同）、
  区间不相交且都在信道内（`start + bins ≤ full`）。
  **测试文件里要写明：位置在本模型里对分布无影响（量过 0.02 dB），所以没有第三条断言可写**
  —— 那句注释就是这条空转的证词。
  **(c) 阴影与份额都还在动**：`shadowSigmaDb > 0` 时同一成员的 `meanSinrDb`
  在相干区间之间跳变，而 `bins` 整轮恒定。
- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** 实现 §6.2 那段。**原先那个 `throw` 要改掉而不是留着**：
  新判据是 `bins ≥ 1` 的整数、以及 **`start + bins ≤ full`**。
  **错误消息照 §4.5.6**：不许说「这些份额坏了」（份额之和大于 1 还有第二种成因 ——
  几台合法共用一片资源单元，而那一种在这个引擎里不存在），
  要说「这一发的份额之和超过了整条信道，而本引擎不建 MU-MIMO-within-OFDMA」，
  并把 `muKind`、各 `ruFraction`、`muParts.length` 一起印出来。
- [ ] **Step 4:** `WIFI_SEL` 加 `binStart` 与 `ruFraction`（§6.4）。
  **`bins` 的含义从「这条信道的格数」变成「这一次判决读了几格」**，这是语义变更，
  所以记录里要有 `ruFraction` 把它说清。**既有四个字段一个都不动。**
  `src/ui/format.ts` 的 `fmtRecord` 是唯一由编译器强制穷尽的开关（TS2366），跟着改。
- [ ] **Step 5:** `npx tsc -b --force` + `npx vitest run`。**fixture 零 diff**
  （九个有多用户帧的场景全部 `selectivity` 缺席，`selCombine` 第一个闸门就返回 `null`）。
- [ ] **Step 6:** 顺手带走同一处出处错在这个文件里的那一份：`src/engine/channel.ts`
  的 `(selBins = 9 per 20 MHz, §9.4.1.75)` —— 标签要分文档（`standard be`），
  理由与证据见 Task 1 的报告与规格 §0.3。规格 §0.3 要求的 `selCombine` 注释改动
  （「整数个**可回报的** 26 音调资源单元」）也在这个文件里，一起做。
- [ ] **Step 7:** 提交（显式路径）。

---

### Task 3: 上行那一片的载体

**Files:** Modify `src/model/frames.ts`、`src/engine/mac.ts`；Test `tests/engine/selectivity.test.ts`

**规格：§4、§6.3、§8 第 5 条。**

**这是整篇规格 brief 之外的那个洞**：基于触发的 PPDU 的 `FrameDesc`
**既没有 `muParts` 也没有 `ruFraction`** —— `respondToTrigger` 算出 `frac = 1/n`
只拿去算字节预算然后丢掉。而 `ofdma-ul.ts` 的 `out-of-scope` 已经许诺这一刀补上它。

- [ ] **Step 1:** 写失败测试：上行场景里每一个基于触发的 PPDU 的
  `WIFI_SEL.bins` 等于 `selMemberBins(width, 1/n)` 而**不是** `selBins(width)`。
  再加一条：`ofdma-ul` 的场景上 fixture 哈希**逐字节不变**（证明新字段不进时序）。
- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** 在 `FrameDesc` 上加两个**可选**字段 `ruFraction` / `ruIndex`，
  `respondToTrigger` 填上。**出处 `standard §9.3.1.22.1`**（触发帧 Common Info 里的
  RU 分配与 UL BW，`ofdma-ul.ts` 的 `sources` 已经引了它）：
  **一台被触发的站点占哪一片是触发帧指定的，所以它该写在被触发那一帧上。**
- [ ] **Step 4:** 加那条反向断言（§8 第 1b 条）：任意一发多用户 PPDU 的 `muParts` 里
  `ruFraction` **要么人人有、要么人人没有**。混了就是 MU-MIMO-within-OFDMA 被偷偷建了出来。
- [ ] **Step 5:** `npx tsc -b --force` + `npx vitest run`。**fixture 零 diff。**
- [ ] **Step 6:** 提交（显式路径）。

---

### Task 4: 这一课的场景 —— 这是会失败的那一步

**Files:** Modify `src/course/wifiScenes.ts`；Test `tests/engine/selectivity-round.test.ts`

**规格：§7.3、§9 第 3 条。**

**已发布的多用户场景一个都不能用**，规格量过四个：`ofdma-dl` 余量中位 15.39 dB
（这一刀在它上面**可证明地空转**）、`ofdma-ul` 12.19 dB、`mumimo(on)` 余量双峰（p5 −4.89，
效应被淹掉）。**只有 `selectivity(20)` 那个约 3.6 dB 的区间上效应干净（9 格 4.97 % → 4 格 14.92 %），
而它只有一台设备。**

- [ ] **Step 1:** 照 `selectivityScenario` 的构造法（两端发射功率各抬
  `noiseDbm(w) − noiseDbm(20)`、设备放到远处客厅、`shadowSigmaDb: 0` 的瑞利、`selectivity: {}`）
  新建一个**两成员**版本，把余量落在 **3 到 4 dB**。
- [ ] **Step 2:** 写**发布闸门**测试：**在同一个实测余量组里，掉帧率随成员那一份变薄严格上升。**
  **调不出来就不许发这一课** —— 报回控制者，不要调判据去凑。
- [ ] **Step 3:** 规格已经点名两个会混进来的量，**先排除它们再调**：
  **余量的双峰**，与**上下行不对称**（它试过三个候选：`from=sta-1` 在 20 MHz 上中位余量 55.94 dB，
  而 `from=ap` 一条记录也没有 —— 下行那一侧没有被分片的帧）。
- [ ] **Step 4:** `npx vitest run`。**fixture 零 diff**（新场景此刻还没有课引用它）。
- [ ] **Step 5:** 提交（显式路径）。

---

### Task 5: 新课 `ru-diversity`

**Files:** Create `src/course/tier2/ru-diversity.ts`；Modify `src/course/lessons.ts`、
`src/course/curriculum.ts`、`tests/course/lessons.test.ts`；
Create `tests/course/ru-diversity.test.ts`；Modify `tests/fixtures/lesson-hashes.json`

**规格：§7.2、§7.5。**

| | |
| --- | --- |
| **id** | `ru-diversity`，`module` 同 `ofdma-dl` |
| **位置** | `COURSE_ORDER` 里 `'ofdma-dl'` 与 `'ofdma-ul'` 之间 |
| **`needs`** | `['ofdma-dl', 'selectivity']`，两条都是硬依赖 |
| **工作标题** | 《分给你的那一片，也分走了你躲开深衰的机会》 |

**一句话结论（照抄 §7.2，不许用 4a 那三个开环数）：**
格少了之后变坏的**不是平均**而是**尾巴** —— 损失中位数几乎不动（九格 2.31 dB、四格 2.20 dB），
而 **p90 从 4.70 dB 涨到 5.85 dB**。切薄一片换来的不是「每帧都差一点」，是「偶尔深得多」，
而偶尔深得多正是一个成员要重传的全部原因。

- [ ] **Step 1:** 写课。四条 `limits` 照 §7.5 逐条（含那个关于格号区间属于资源单元、
  以及 MU-MIMO 下限 HE 106 音调 / EHT 242 音调的分句）。
  **⚠ 「被截掉的那一格」这句话要按带宽分开说**（规格 §2.3 的 2026-10-04 更正）：
  20 MHz 两成员丢**一格**（中间那个 RU 5），而 **40 MHz 四成员丢两格**（RU 5 与 RU 14），
  **而 40 MHz 没有「中间那一格」**（18 是偶数，直流落在 RU 9 与 RU 10 之间）。
  笼统说「那一格」会在 40 MHz 的例子上被抓。
- [ ] **Step 2:** `wording.test.ts` 与 `readability.test.ts` 全过。
  **不要用字符串存在比对去探首次出现规则**，让测试自己打印失败数组。
- [ ] **Step 3:** 课文印的**每一个数**都要有断言。
- [ ] **Step 4:** 生成 fixture 行：**这一步是这一刀唯一允许跑 `UPDATE_HASHES=1` 的地方**。
  跑完逐行确认**只有新增**；任何既有行变了就还原、停下、报给控制者。
- [ ] **Step 5:** `npx tsc -b --force` + `npx vitest run` 全量全绿。
- [ ] **Step 6:** 提交（显式路径）。

---

### Task 6a: 先退役那两句现在为假的话（Task 3 之后立刻做）

**Files:** Modify `src/course/tier2/ofdma-dl.ts`、`ofdma-ul.ts` 及它们的测试

**为什么单独提前**：Task 2 落地之后，`ofdma-dl` 与 `ofdma-ul` 那两条
`out-of-scope`（「一个多用户成员在这里拿到的是**整条信道**的格数……分集被整整高估了
成员数那么多倍」）**从那个提交起就是假话**。等到 Task 6 再退役，中间每一次提交上
课程都在说假话。**这一步只做「把假话换成真话」，不加 `until`**
（`until: 'ru-diversity'` 要等 Task 5 把那一课建出来）。

- [ ] **Step 1:** 两条 `out-of-scope` 的内容改成现在成立的说法：成员拿到的是
  **它那一份截到整数格之后的格数**；而**位置在这里不起作用**，因为各格独立。
- [ ] **Step 2:** 两头钉住（新说法 `toContain`、旧说法 `not.toContain`）。
- [ ] **Step 3:** **`limits` 在 `mainPathChars` 之外，所以两课时长不该动——核一遍。**
- [ ] **Step 4:** `npx tsc -b --force` + `npx vitest run`。**fixture 零 diff。**
- [ ] **Step 5:** 提交（显式路径）。

---

### Task 6: 四课的 `limits`，逐条按 §7.4

**Files:** Modify `src/course/tier2/ofdma-dl.ts`、`ofdma-ul.ts`、`selectivity.ts`、
`mumimo-choose.ts` 及它们的测试

**规格：§7.4 那张表，逐行照做。**

- [ ] **Step 1:** `ofdma-dl` 与 `ofdma-ul` 那两条 **Task 6a 已经换过内容**，
  这一步只把 `kind` 调成 `model-value` 并**加上 `until: 'ru-diversity'`**。
- [ ] **Step 2:** `ofdma-dl` 等分那条 `model-value` **只加 `until`**，内容不动。
- [ ] **Step 3:** `selectivity.ts` 的 `out-of-scope` 末句退役，换成「成员拿到的是它那一份
  截到整数格之后的格数；而**位置**在这里不起作用，因为各格独立 —— 六个四格窗口在 0.02 dB 以内一致」。
  `numbers` 段那一句**缩写并指向新课**（净减字，30 分钟上限不会被碰 —— **核一遍，不要假设**）。
- [ ] **Step 4:** `mumimo-choose.ts` 那句「甚至可以在同一个 PPDU 里把两种划分混着用」
  **加强它，不新增一条**：标准把它规定成具名、带能力位的特性（DL/UL MU-MIMO within OFDMA），
  **而且给了尺寸下限 —— HE 106 音调、EHT 242 音调**；引擎里两者互斥。
  **不要写成「真实调度器可以更聪明」。**
- [ ] **Step 5:** `mumimo.ts` 的四条**不动**；`frame-anatomy-bytes.ts` 那条**不动**
  （它说的是空口时间，是路 2 / 4d 的题目，**不许在这一刀里顺手改口**）。
- [ ] **Step 6:** 每条改动在那一课自己的测试里两头钉住（新说法 `toContain`、旧说法 `not.toContain`）。
  **`limits` 在 `mainPathChars` 之外，所以各课时长不该动 —— 核一遍。**
- [ ] **Step 7:** **同一处出处错还活在三处课文／词条里，一起修**（Task 1 核出来的，
  它一个字都没动，留给这一步）：
  - **`src/course/tier2/selectivity.ts` 的 `sources`**：「出自 **IEEE Std 802.11** 的
    信道质量指示字段（§9.4.1.65 与 §9.4.1.75）」——**这是课文里的一句事实错误**。
    `9.4.1.65`（HE CQI Report field）在基础标准里 6 次、在 11be 里 0 次；
    `9.4.1.75`（EHT CQI Report field）**反过来**。**两个条号分住两份文档，
    所以改的时候不能把 `.65` 一起挪走。**
  - `src/course/tier1/mcs-ladder.ts` 同样把两个条号并列、不分文档。
    **而 `tests/course/mcs-ladder.test.ts:278-279` 正在断言课文里出现这两个条号**，
    改课文要连带改它。
  - `src/ui/glossary.ts` 同样。
- [ ] **Step 8:** `npx tsc -b --force` + `npx vitest run` 全量。**fixture 零 diff。**
- [ ] **Step 9:** 提交（显式路径）。
