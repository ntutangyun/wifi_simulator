# 保护间隔的选择（切片 4c）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把保护间隔（guard interval）做成一个场景能选的发送侧参数，**把它的代价算准**
（符号时长、三列速率、4× LTF 那 8.8 µs 前导码），**并把它的收益在这个引擎里恒等于零这件事
指名道姓地钉住**——因为解调门限对保护间隔失明是签名级的事实，而丢帧率在各档之间的差值
全部是重采样噪声。

**Architecture:** `PHY_MODES[*].symNs` **一个纳秒都不动**，它从此是
`symNsFor(mode, TGI_NS.base)` 的别名；需要保护间隔的新路径走三个新纯函数
（`symNsFor` / `preambleNsFor` / `ltfExtraNs`）。场景多一个缺省不存在的小节，
`FrameDesc` 多一个基本档缺席的可选字段，`WifiMacCfg` 多一个取场景常量的可选方法，
而六个空口时间调用点由 `airModeNs` **一处集中注入**，不逐点改。
`mbps` 从一个字面量数组变成一张三列表的查询，默认列逐项不变。
**六个新常数，零个 `model`，六个全有表号。**

**Tech Stack:** TypeScript、Vitest、zod。确定性引擎（整数纳秒、`splitmix32`、记录即真相）。

**Spec:** `docs/superpowers/specs/2026-10-05-guard-interval-design.md`（858 行，提交 `bfa8658`）。
**每个任务都要读它点名的那一节**，数值与条号照抄，不要重算。

## Global Constraints

- **`LimitKind` 恰好四个**：`threshold | unmodelled | model-value | out-of-scope`。**`regulation` 不是。**
- **不许把标准正文抄进仓库**；条号、字段名、数值可以，句子不可以。
- **每个常数标出处**：`standard §x` / `standard be §x` / `model` / `physics`。
  这一刀的六个常数**全部**是 `standard §27.3.9 Table 27-13` / `standard be §36.3.10 Table 36-18`，
  **一个 `model` 都不要**。唯一标 `model` 的是「场景只开放哪两档」这个选择（§3.3）。
- **印一个数就在那一格写清量具**：跑多久、什么场景、什么种子、全体还是子集。
- **`tests/fixtures/lesson-hashes.json` 与 `uwb-record-hashes.json` 只许增行，而且只许增一行
  （`airtime#0`）。** **Task 1–6、8、9 必须零 diff**；**只有 Task 7 Step 7 允许跑一次
  `UPDATE_HASHES=1`**，跑完逐行确认只有新增（`git diff --stat tests/fixtures/` 要**跑**，不要推断）。
  依据是哈希的定义本身：`updateHash` 只吃 `` `${r.t}:${r.seq}:${r.type}` ``
  （`src/engine/simulation.ts:434-441`），所以只有改变时序的东西能动它。
- **`PHY_MODES[*].symNs` 的四个字面量一个都不改**，`preambleNs` 的四个也不改。
- 课文中文、全角标点；`wording.test.ts` 与 `readability.test.ts` **无豁免名单**，
  **首次出现规则是位置性的**（英文名在首次使用处 40 字以内）。
  **禁词里这一刀最容易撞的是「买到」**（`tests/course/wording.test.ts` 的 `REGISTER`），
  以及「账」「更贵」「省钱」「值钱」「白费」「定死」「说了算」「惩罚」「门口」。
  规格正文里那句「长 GI **买到了**可靠性」**不许原样进课文或测试断言**；
  「买不到」不含被禁子串，但也不要用——这一课说的是「代价」与「这里看不见的那一侧」。
- 提交**只用显式路径**（`git commit -F <file> -- <paths>`）；不要 `-a`／`--amend`／`git reset`／裸
  `stash`。提交信息末尾两行：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 与
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`。
- 验证 `npx tsc -b --force`（`tsc -b` 会缓存）与 `npx vitest run` 全量。
  **`tsc` 只在这个 worktree 里跑得干净**（主检出 `D:\wifi_sim` 缺 `@types/node`）。
- **临时探针放 scratchpad**，用 `npx vite-node --root <worktree> <scratchpad 文件>` 跑，
  **不要在 `tests/` 下建临时文件**。
- **一个特性不跑完一轮并读过输出就不算做完**；**扫接口的调用方，不是任务的文件清单**。

### 这一刀付过代价的纪律

- **最该防的不是「空转」，是一条写得像物理的噪声断言。** 同一个旋钮在 `capstone` 上让丢帧率
  从 5.44 % 掉到 4.57 %、在 `ru-diversity` 上从 14.29 % 涨到 17.86 %、在 `rate-cost` 上非单调
  （−10.62 → −27.05 → −13.23 %），而解调门限一分贝都没动。**Task 6 整个任务只做这件事。**
- **先怀疑尺子。** 这一刀的三个量具（A 纯算术重定价、B 真实四轮、C 对表）各自只回答一类问题，
  一个场景上量出来的数不许写进另一个场景的课文。
- **一个被允许却可证明无效果的配置，正是一个特性看起来做完了的方式。** 规格 §5 点名六条，
  Task 4 与 Task 6 各钉一半。

---

### Task 1: `phy.ts` 的纯函数层——六个常数、三个函数、三列速率

**Files:** Modify `src/engine/phy.ts`；
Test `tests/engine/phy-modes.test.ts`，Create `tests/engine/guard-interval.test.ts`

**规格：§1.1、§1.2、§1.4、§3.1、§3.2、§3.6、§6.1 末两段、§8 第 1／2 条、§2.1。**

**Interfaces — Produces:**

    export const TDFT_EHT_NS: Ns                       // 12_800
    export const TGI_NS: { readonly base: 800; readonly double: 1_600; readonly quad: 3_200 }
    export const TLTF_2X_NS: Ns                        // 6_400
    export const TLTF_4X_NS: Ns                        // 12_800
    export const GI_MODES: readonly PhyMode[]          // ['he', 'eht']
    export function symNsFor(mode: PhyMode, giNs?: Ns): Ns
    export function ltfExtraNs(giNs?: Ns): Ns
    export function preambleNsFor(mode: PhyMode, giNs?: Ns): Ns
    export function mcsRateMbps(mode: PhyMode, mcs: number, giNs?: Ns): number   // 第三参数是新增的
    export interface TxTimeOpts { mu?: boolean; ruFraction?: number; widthMhz?: number; nss?: number; giNs?: Ns }

**六个常数的出处标签，逐个照抄到注释里**（规格 §3.2 那张表）：

| 常数 | 值 | 注释里要写的出处 |
| --- | --- | --- |
| `TDFT_EHT_NS` | `12_800` | `standard §27.3.9 Table 27-13` / `standard be §36.3.10 Table 36-18`（T_DFT,HE / T_DFT,EHT） |
| `TGI_NS.base` | `800` | 同上（T_GI1,Data） |
| `TGI_NS.double` | `1_600` | 同上（T_GI2,Data） |
| `TGI_NS.quad` | `3_200` | 同上（T_GI4,Data） |
| `TLTF_2X_NS` | `6_400` | 同上（T_HE-LTF-2X / T_EHT-LTF-2X） |
| `TLTF_4X_NS` | `12_800` | 同上（T_HE-LTF-4X / T_EHT-LTF-4X） |

`GI_MODES` 不是第七个常数，它是 `GI_TYPE` 在场条件的那张两项清单，
出处 `standard §27.2 Table 27-1` / `standard be §36.2 Table 36-1`（`FORMAT` 为
`HE_SU`/`HE_MU`/`HE_ER_SU`/`HE_TB`/`EHT_MU`/`EHT_TB` 时在场）。
**注释里要写明它和 `selBinnableGen` 为什么是两张清单而不是一张**：
`selBinnableGen` 读的是子载波间隔（78.125 kHz 才分得出 26 音调资源单元），
`GI_MODES` 读的是 TXVECTOR 里有没有 `GI_TYPE` 这个参数。两件事今天取值相同、依据不同，
合成一张会让下一个人以为改一处就够。

- [ ] **Step 1:** 写失败测试（新文件 `tests/engine/guard-interval.test.ts`），**七组**：

  **(a) 焊死那条别名。** `symNsFor(m, TGI_NS.base) === PHY_MODES[m].symNs` 对
  `nonht`/`vht`/`he`/`eht` **四个 mode 都成立**；而 `symNsFor('nonht', TGI_NS.quad)` 与
  `symNsFor('vht', TGI_NS.quad)` **仍然是 4_000**（无条件返回）。
  **`symNs` 从此是一个别名，不是一个独立的事实。**

  **(b) 三个符号时长。** `symNsFor('he', TGI_NS.base) === 13_600`、
  `symNsFor('he', TGI_NS.double) === 14_400`、`symNsFor('he', TGI_NS.quad) === 16_000`，
  `eht` 三条同值。

  **(c) 「数是算出来的，不是写死的」自检**（规格 §8 第 1 条，照 4a §9 第 1 条立的那条）：
  在测试里**不改源文件**地重算一遍——写一个本地的
  `sym = (dft: number, gi: number) => dft + gi`，断言把 DFT 周期换成 `3_200`
  （pre-HE / pre-EHT 那一档的 T_DFT,Pre）之后三个符号时长变成
  **4_000 / 4_800 / 6_400**，而 `symNsFor` 的实现对 `TDFT_EHT_NS` 的依赖是同一个加法。
  实现方式：`symNsFor` 的函数体必须恰好是 `TDFT_EHT_NS + giNs`，
  测试断言 `symNsFor('he', g) - TGI_NS[k] === TDFT_EHT_NS` 对三档都成立，
  **于是「12.8 + 0.8 = 13.6」这个和式在测试里看得见，而不是一个巧合的字面量**。

  **(d) 8.8 µs 那一笔。** `ltfExtraNs(TGI_NS.quad) === 8_800`，
  `ltfExtraNs(TGI_NS.base) === 0`、`ltfExtraNs(TGI_NS.double) === 0`，
  且 `ltfExtraNs(TGI_NS.quad) === (TLTF_4X_NS + TGI_NS.quad) - (TLTF_2X_NS + TGI_NS.base)`
  （**算出来的，不是量出来的**，依据是 §1.4 那张 (LTF, GI) 配对表）。
  并断言 `preambleNsFor('he', TGI_NS.quad) === 52_800`、
  `preambleNsFor('eht', TGI_NS.quad) === 56_800`，
  而 `preambleNsFor('vht', TGI_NS.quad) === 40_000`、
  `preambleNsFor('nonht', TGI_NS.quad) === 20_000`（**旧两代永不付这 8.8 µs**）。

  **(e) 三列速率，逐格对表**（规格 §0.4、§8 第 2 条）。把 Table 36-76 那 14 行的
  N_DBPS 从 `PHY_MODES.eht.ndbps` 读出来（**它就是那一列**），断言
  `round(ndbps / (symNsFor(mode, gi) / 1000), 1)` 对 **四个 mode × 三档** 都等于
  `mcsRateMbps(mode, mcs, gi)`；并断言 **`mcsRateMbps(m, i, TGI_NS.base)` 对四个 mode 的
  每一个 MCS 都逐项等于 `PHY_MODES[m].mbps[i]`**（**已量过：四个 mode 全部逐项相同**，
  连 `nonht` 的字面量速率表与 `vht` 的 `n / 4` 都落在这同一个算式上）。
  再钉住课文要印的六个数：
  `mcsRateMbps('he', 11, …) === 143.4 / 135.4 / 121.9`、
  `mcsRateMbps('eht', 13, …) === 172.1 / 162.5 / 146.3`。
  **这一条是 §3.6 那个决定的全部依据；它要是不符，`mbps` 那条路就得重想。**

  **(f) 空口时间的三档，以及那个塌缩。** `txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs })`
  在三档下是 **125_600 / 130_400 / 148_800 ns**（第三档含 8.8 µs，前导码从 44 变 52.8），
  而**符号数在三档下都是 6**（断言 `(t - preambleNsFor('he', gi)) / symNsFor('he', gi) === 6`）。
  再钉 230 B 那一帧（§0.3）：**57_600 / 58_400 / 68_800 ns**，
  以及**不算 4× LTF 时的 60_000 ns**（用 `symNsFor` 直接算，不经过 `txTimeModeNs`，
  因为引擎永不发出「3.2 µs GI + 2× LTF」那一档）。

  **(g) 解调门限对保护间隔失明，是签名级的**（规格 §2.1、§5 第 6 条 (i)）。
  `reqSinrDb(mode, mcs)` 对 `he` 的 12 个与 `eht` 的 14 个 MCS 各算一次，
  **在进程内把 `PHY_MODES.he/eht.symNs` 改成 16_000 再算一次**，断言
  **26 个值逐项相同、零差异**。测试注释里要写明：
  **这不是「目前相同」，是 `reqSinrDb` 的签名里就没有时间这个参数**，
  所以任何「长保护间隔改变了掉帧」的观测都不可能来自门限。

- [ ] **Step 2:** 跑 `npx vitest run tests/engine/guard-interval.test.ts`，确认失败
  （常数与三个函数都不存在，`mcsRateMbps` 只有两个参数）。

- [ ] **Step 3:** 实现。按这个形状，**不要把 `symNs` 变成函数**：

      /** Data-field IDFT/DFT period of the HE and EHT PHYs. standard §27.3.9 Table 27-13 / standard be §36.3.10 Table 36-18 */
      export const TDFT_EHT_NS: Ns = 12_800

      /** The three data-field guard intervals TXVECTOR's GI_TYPE selects. Same tables. */
      export const TGI_NS = { base: 800, double: 1_600, quad: 3_200 } as const

      /** One 2x / 4x HE-LTF or EHT-LTF symbol, GI excluded. Same tables. */
      export const TLTF_2X_NS: Ns = 6_400
      export const TLTF_4X_NS: Ns = 12_800

      /** The PPDU formats GI_TYPE is a TXVECTOR parameter of. standard §27.2 Table 27-1 / standard be §36.2 Table 36-1 */
      export const GI_MODES: readonly PhyMode[] = ['he', 'eht']

      export function symNsFor(mode: PhyMode, giNs: Ns = TGI_NS.base): Ns {
        if (!GI_MODES.includes(mode)) return PHY_MODES[mode].symNs
        return TDFT_EHT_NS + giNs
      }

      export function ltfExtraNs(giNs: Ns = TGI_NS.base): Ns {
        if (giNs !== TGI_NS.quad) return 0
        return (TLTF_4X_NS + TGI_NS.quad) - (TLTF_2X_NS + TGI_NS.base)
      }

      export function preambleNsFor(mode: PhyMode, giNs: Ns = TGI_NS.base): Ns {
        const extra = GI_MODES.includes(mode) ? ltfExtraNs(giNs) : 0
        return PHY_MODES[mode].preambleNs + extra
      }

      export function mcsRateMbps(mode: PhyMode, mcs: number, giNs: Ns = TGI_NS.base): number {
        if (giNs === TGI_NS.base) return modeEntry(PHY_MODES[mode].mbps, mode, mcs)
        const ndbps = modeEntry(PHY_MODES[mode].ndbps, mode, mcs)
        return Math.round((ndbps / (symNsFor(mode, giNs) / 1000)) * 10) / 10
      }

  **`mcsRateMbps` 在基本档走查表而不是走算式**，虽然两者已量过逐项相同（四个 mode 全部）：
  查表保证已发布课程里那一列**逐字符不变**，而不是依赖一次浮点重算的相等。
  **这一句要写进注释**，否则下一个人会把它简化成一行算式。
  `Math.round(x * 10) / 10` 这个取整约定的出处是 **`standard §19.5`**
  （Table 19-27 逐字写明速率取一位小数），**不是本仓库发明的**——这一句也写进注释。

- [ ] **Step 4:** `txTimeModeNs` 的 `TxTimeOpts` 加 `giNs?: Ns`，函数体改成读
  `preambleNsFor(mode, giNs)` 与 `symNsFor(mode, giNs)`：

      const giNs = opts.giNs ?? TGI_NS.base
      const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
      return preambleNsFor(mode, giNs) + (opts.mu ? m.muExtraPreambleNs : 0) + symNsFor(mode, giNs) * nsym

  **`muExtraPreambleNs` 不乘不加**：HE-SIG-B / EHT-SIG 是前导码里的传统段，
  §1.1 末尾那条（T_GI,Pre-HE / T_GI,Pre-EHT 固定 0.8 µs，与数据字段的 GI 无关）就是依据。

- [ ] **Step 5:** 三处注释改正（**只改注释，不改值**）：
  - `PHY_MODES.he/eht` 那两行的 `symNs: 13_600` 旁边写明它是
    **Table 27-13 / Table 36-18 的 T_SYM1 = T_DFT,EHT + T_GI1,Data = 12.8 + 0.8 µs，
    不是一个代表值**（规格 §1.1 的更正：今天的注释把它和 44/48 µs 的前导码并列成
    「representative SU values」，而**前导码是代表值，13.6 不是**）。
  - `PHY_MODES.nonht/vht` 那两行的 `symNs: 4_000` 旁边写明它是
    T_DFT,Pre（3.2 µs）+ 800 ns，出处 `standard §19.5 Table 19-6` / `standard §21.3.6 Table 21-5`
    （规格 §6.1 第一条末句）。**补注释不等于建功能**：400 ns 短保护间隔**不建**，
    理由是 §19.3.5 与 Table 19-27 的 NOTE 各逐字写明它「发送与接收都是可选的」，
    而 HE/EHT 那三档全部强制（§1.5）——**这一句也写进注释，因为它是「为什么只建一半」的依据**。
  - `preambleNs: 44_000 / 48_000` 旁边写明它是**「2× LTF + 基本 GI」那一档**：
    按 Table 27-13 逐段加和是 8 + 8 + 4 + 4 + 8 + 4 + 7.2 = **43.2 µs**（EHT 把 HE-SIG-A
    换成 U-SIG 8 + EHT-SIG 4 得 **47.2 µs**），引擎存的是 44 / 48。
    **注释要诚实地写「≈」而不是「=」**：那 0.8 µs 的差额是这两个常数自己的取整，
    所以 `preambleNsFor('he', quad) = 52.8 µs` 是**引擎存的 44 加上那一笔 8.8 µs 差额**，
    不是 Table 27-13 直接给出的一个值。

- [ ] **Step 6:** `tests/engine/phy-modes.test.ts` 补两条，**把「GI 不改星座」钉住**
  （规格 §3.6 末段、§8 第 7 条，出处 `standard §10.6`）：
  `ctrlRespRateForMode('he', 11, mcsRateMbps('he', 11, TGI_NS.quad))` 与
  `ctrlRespRateForMode('he', 11, mcsRateMbps('he', 11))` **相等**（都是 24），
  `eht` MCS 13 同；并断言 `NONHT_REF_MBPS` **没有多一个维度**（`.length === 14`）。
  测试注释写明：**§10.6 的控制帧响应走非 HT 参考速率，而参考速率由星座与码率决定，
  保护间隔不改星座——这不是妥协，是条号。** 「让 `mbps` 跟着 GI 走」最容易顺手破坏的就是它。

- [ ] **Step 7:** `npx tsc -b --force` + `npx vitest run`。**全量**，不只跑 `tests/engine`——
  `mcsRateMbps` 有 9 个 `src/` 调用点与 6 个测试文件引用，新增的是**带默认值的第三参数**，
  但要用编译器和全量测试证明没有一个调用点因为参数位置进错而「以错误理由通过」。
  **`git diff --stat tests/fixtures/` 必须是空的。**

- [ ] **Step 8:** 提交（显式路径：`src/engine/phy.ts`、`tests/engine/phy-modes.test.ts`、
  `tests/engine/guard-interval.test.ts`）。

---

### Task 2: `FrameDesc.giNs`、`ppduLayout` 的数据段与前导段，以及帧详情那一行

**Files:** Modify `src/model/frames.ts`、`src/model/frameFields.ts`、`src/ui/FrameDetail.tsx`、
`src/ui/i18n.ts`；Test `tests/model/frameFields.test.ts`

**规格：§3.4、§3.7、§5 第 5 条 (ii)、§8 第 10 条。**

**这一步只做载体，不接线**：做完之后**没有任何代码写 `giNs`**，于是 fixture 零风险，
而 `ppduLayout` 的新路径靠手工构造的 `FrameDesc` 测。

**Interfaces — Consumes:** Task 1 的 `TGI_NS`、`symNsFor`、`preambleNsFor`、`GI_MODES`。

**Interfaces — Produces:**

    // src/model/frames.ts · FrameDesc 上新增
    /** TXVECTOR's GI_TYPE for the data field; ABSENT when the base GI is in use. standard §27.2 Table 27-1 */
    giNs?: Ns

    // src/ui/i18n.ts · STRINGS 上新增
    guardInterval: (giUs: number, name: string) => string   // 「保护间隔 3.2 µs（四倍）」
    giName: { double: string; quad: string }                // 「双倍」「四倍」

- [ ] **Step 1:** 写失败测试（`tests/model/frameFields.test.ts`），四条：
  **(a)** `giNs` 缺席的 HE 帧（`txTimeNs: 125_600`）的 `ppduLayout`：
  前导段 **44_000**、数据段 `symNs === 13_600`、`symbols === 6`、**没有 `padding` 段**，
  各段 `durNs` 之和 `=== txTimeNs`。**逐字节就是今天的输出。**
  **(b)** `giNs: 3_200` 的 HE 帧（`txTimeNs: 148_800`）：前导段 **52_800**、
  数据段 `symNs === 16_000`、`symbols === 6`、**仍然没有 `padding` 段**，和仍 `=== txTimeNs`。
  **⚠ 这一条会抓住规格 §3.7 漏掉的那半句**：只改数据段而不改前导段，
  `rest = 148_800 − 44_000 = 104_800`，`symbols = 6`，于是会多长出一个 **8.8 µs 的 `padding` 段**
  ——段和仍等于 `txTimeNs`，所以「段和相等」这条断言抓不住它，**必须单独断言没有 padding
  且前导段是 52_800**。
  **(c)** `giNs: 3_200` 而 `mode: 'vht'` 的帧：前导段 **40_000**、数据段 `symNs === 4_000`
  （`symNsFor` 对旧两代无条件返回，`preambleNsFor` 不付 8.8 µs）。
  **(d)** `giNs: 3_200` 的 MU 下行帧（`muParts` 在场）：`muSig` 段仍是 **4_000**
  （前导码里传统字段的 GI 固定 0.8 µs，与数据字段的 GI 无关，§1.1 末段）。
- [ ] **Step 2:** 跑它，确认失败（(b)(c)(d) 红，(a) 绿）。
- [ ] **Step 3:** `FrameDesc` 加那个可选字段。**基本 GI 时字段缺席，而不是写 800。**
  注释里写明两条理由（规格 §3.4）：`ppduLayout` 手上只有 `FrameDesc`，
  缺席要能被读成「走老路、原样交回」——`linkDbm`（**`src/engine/channel.ts:627`**）
  与 `resolveLock` 立的就是这条写法；以及它让记录与 UI 在已发布课程里**逐字符不变**。
  **注释里不要引 4a §8 那个 `455-457` 行号，它在 4b 合并之后已经失效**（Task 9 去改 4a）。
- [ ] **Step 4:** `ppduLayout` 改三处（`src/model/frameFields.ts:473` 起那一段）：

      const giNs = f.giNs ?? TGI_NS.base
      // ... 非 nonht 那一支：
      const head0 = preambleNsFor(mode, giNs)
      segs.push({ key: 'preamble', durNs: head0 })
      head = head0
      // ... 数据段：
      const symNs = symNsFor(mode, giNs)
      const symbols = Math.floor(rest / symNs)
      segs.push({ key: 'data', durNs: symbols * symNs, symbols, symNs })
      const pad = rest - symbols * symNs

  `nonht` 那一支**一个字都不动**（`GI_TYPE` 在那一代里是 `LONG_GI`/`SHORT_GI` 的另一组枚举，
  和这三档根本不是同一组值——规格 §5 第 2b 条；这一句写进注释）。
- [ ] **Step 5:** `FrameDetail.tsx` 在 PPDU 分段列表之后加一行，**仅当 `f.giNs !== undefined`**：
  `S.guardInterval(f.giNs / 1000, S.giName[f.giNs === TGI_NS.quad ? 'quad' : 'double'])`
  → 「保护间隔 3.2 µs（四倍）」。
  「`n` 个符号 × `x` µs」那一行**不用改**：`S.symbols(p.symbols, p.symNs / 1000)`
  已经从段里读，于是它**自动**变成「6 个符号 × 16 µs」。
  `src/ui/i18n.ts` 只有一份中文表（`STRINGS`，第 674 行起），加两项，类型声明同步。
- [ ] **Step 6:** **浏览器那一关这一步先不做**：此刻没有任何已发布场景会产生带 `giNs` 的帧，
  所以两个折叠屏尺寸的目视检查**排在 Task 7 Step 8**（那时 `airtime#0` 才真的发出这种帧）。
  **这一行写进本任务的提交信息里**，免得下一个人以为 §8 第 10 条被跳过了。
- [ ] **Step 7:** `npx tsc -b --force` + `npx vitest run`。**fixture 零 diff**
  （没有一行代码写 `giNs`，所以这一条有结构性保证）。
- [ ] **Step 8:** 提交（显式路径：`src/model/frames.ts`、`src/model/frameFields.ts`、
  `src/ui/FrameDetail.tsx`、`src/ui/i18n.ts`、`tests/model/frameFields.test.ts`）。

---

### Task 3: 场景小节 `guardInterval`、它的拒绝消息，以及编辑器那个控件

**Files:** Modify `src/model/scenario.ts`、`src/editor/planOps.ts`、`src/editor/EditorGuide.tsx`；
Test `tests/model/scenario.test.ts`、`tests/editor/planOps.test.ts`

**规格：§3.3、§3.8、§1.5、§5 第 1／2 条。**

**这一步仍然不接线**：schema 收下这一节，而引擎还没有人读它。

**Interfaces — Produces:**

    // src/model/scenario.ts
    export interface GuardIntervalCfg { gi: 'double' | 'quad' }
    export function guardIntervalRefusals(sc: Pick<Scenario, 'nodes'>): string[]
    // Scenario 上新增： guardInterval?: GuardIntervalCfg

    // src/editor/planOps.ts
    export function guardIntervalSwitch(sc: Scenario): { gi: 'base' | 'double' | 'quad'; live: boolean; refusals: string[] }
    export function guardIntervalToggle(gi: 'base' | 'double' | 'quad'): GuardIntervalCfg | undefined

**Interfaces — Consumes:** Task 1 的 `GI_MODES`；`minGen`（`src/model/scenario.ts` 已 import）。

- [ ] **Step 1:** 写失败测试，六条：
  **(a)** 不写这一节的场景解析之后**没有 `guardInterval` 这个属性**
  （`'guardInterval' in parsed === false`），**不是一个填了 `base` 的对象**——
  这是 `fading` 的注释逐字立过的规矩（`src/model/scenario.ts:1033-1053`）：
  **默认值落在字段上，永不落在小节上。**
  **(b)** `guardInterval: { gi: 'double' }` 与 `{ gi: 'quad' }` 在一个有 `eht`–`he` 链路的
  场景上解析成功。
  **(c)** `guardInterval: { gi: 'base' }` **解析失败**，且消息里**出现「13.6」与「TB」**
  （规格 §5 第 1 条点名的那两个字符串）。
  **⚠ 这一条不写，下一个人加回 `'base'` 时没有一条红线。**
  **(d)** `guardInterval: {}`（缺 `gi`）解析失败。
  **(e)** 一个接入点 `eht`、站点 `vht` 的场景（**链路是 `vht`**）带 `guardInterval` 解析失败，
  消息里出现「链路」与「minGen」——**不是「设备」**。
  4a 的 `hasBinnableLink` 就是为这个洞存在的：按设备问，把接入点降级会让拒绝消失。
  **(f)** `guardIntervalRefusals` **不读 `sc.fading`**：一个没有 `fading` 小节、
  但有 `eht`–`eht` 链路的场景上它返回**空数组**（与 `selectivity` 不同）。
  测试注释写明：**GI 的作用在时间轴上，不经过衰落抽样；要求 `fading` 会是一条假的依赖。**
- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** 实现 schema。照 `SelectivitySchema`（`:1095`）与 `FadingSchema`（`:1055`）的写法：

      const GuardIntervalSchema = z.object({
        gi: z.enum(['double', 'quad'], {
          errorMap: () => ({ message: '保护间隔只接受 double（1.6 µs）与 quad（3.2 µs）两个值。基本保护间隔 0.8 µs 不是这里的一个取值：它就是 PHY_MODES[*].symNs 里那个 13.6 µs（12.8 µs 的离散傅里叶变换周期加 0.8 µs），写出来与整节不写逐字节相同。另外它是三档里唯一一个对某种 PPDU 格式不强制的——基于触发的 TB PPDU 的强制组合里没有 0.8 µs（§27.1.1 / §36.1.1）' }),
        }),
      })

  `Scenario` 上 `guardInterval: GuardIntervalSchema.optional()`，**不带 `.default()`**。
  注释里写明「没有 `'base'`」的两条理由（规格 §3.3）与「字段叫 `gi` 不叫 `long`/`robust`」
  的理由：**名字里不许出现任何暗示它买到了什么的词**，而 `double`/`quad`
  是 Table 27-13 自己 description 栏的用词。
- [ ] **Step 4:** `guardIntervalRefusals` 与 `selectivityRefusals`（`:1174`）并列，**一条规则**：

      export function guardIntervalRefusals(sc: Pick<Scenario, 'nodes'>): string[] {
        if (hasGiLink(sc.nodes)) return []
        return ['保护间隔（guard interval）需要场景里至少有一条 eht 或 he 链路——注意是链路，不是设备：一条链路实际用的 PPDU 格式是两端世代里较低的那一个（minGen），所以「旧路由器 + 新笔记本」这样的配对跑出来是 vht 链路。TXVECTOR 的 GI_TYPE 只在 FORMAT 为 HE/EHT 的那几种格式下在场（Table 27-1 / Table 36-1），而 nonht 与 vht 的符号固定 4 µs（Table 19-6 / Table 21-5），它们那 400 ns 的短保护间隔是另一组枚举、而且标准写明收发都是可选的，本仿真器不建。请让接入点和至少一台终端都到 he 或 eht，或者把 guardInterval 去掉']
      }

  `hasGiLink` 照 `hasBinnableLink`（`:1168`）的写法，**读 `GI_MODES` 而不是 `selBinnableGen`**
  （Task 1 Step 3 的注释已说明为什么是两张清单）。
  `superRefine` 里把每条字符串变成 `path: ['guardInterval']` 上的 issue。
- [ ] **Step 5:** `planOps.ts` 加 `guardIntervalSwitch` / `guardIntervalToggle`，
  照 `selectivitySwitch`（`:485`）与 `selectivityToggle`（`:500`）的写法：
  `live` **不是「没有拒绝」**，而是 `当前不是 base || refusals.length === 0`——
  已经开着的那一档必须留着能关，否则读者会卡在一个无效场景上而唯一能救它的控件不响应。
  **这一段注释照 `selectivitySwitch` 的理由抄，不要重新发明。**
  `withGuardInterval(sc, cfg)` 不需要 `withFading` 那种联动（GI 不依赖 `fading`）。
  `EditorGuide.tsx` 加一段说明，**指向 `guardIntervalRefusals` 这个名字**，
  与它对 `selectivityRefusals` 的写法一致（第 184 行附近）。
- [ ] **Step 6:** `npx tsc -b --force` + `npx vitest run`。**fixture 零 diff**
  （没有一个已发布场景写这一节）。
- [ ] **Step 7:** 提交（显式路径：`src/model/scenario.ts`、`src/editor/planOps.ts`、
  `src/editor/EditorGuide.tsx`、`tests/model/scenario.test.ts`、`tests/editor/planOps.test.ts`）。

---

### Task 4: 接线——一处注入、一处正确性修正、三类空转的断言

**Files:** Modify `src/engine/mac.ts`、`src/engine/simulation.ts`；
Test `tests/engine/guard-interval.test.ts`、Create `tests/engine/guard-interval-round.test.ts`

**规格：§3.5、§5 第 2／2b／3／4／5 条、§8 第 3／5／6 条。**
**这是这一刀唯一一处「不改就会错」的地方（§3.5），所以它有自己的一条验收。**

**Interfaces — Consumes:** Task 1 的 `TGI_NS` / `GI_MODES` / `symNsFor` / `preambleNsFor` /
`mcsRateMbps`；Task 2 的 `FrameDesc.giNs`；Task 3 的 `Scenario.guardInterval`。

**Interfaces — Produces:**

    // src/engine/mac.ts · WifiMacCfg 上新增
    /** The data-field guard interval this scenario selects, ns; absent = the base GI. */
    giNs?(): Ns | undefined

    // src/engine/mac.ts · maxPsduBytesFor 第七个参数（带默认值）
    export function maxPsduBytesFor(
      mode: PhyMode, mcs: number, ruFraction: number, durNs: Ns,
      widthMhz?: number, nss?: number, giNs?: Ns,
    ): number

- [ ] **Step 1:** 写失败测试。**五组，前两组是正确性，后三组是空转。**

  **(a) 正确性：触发出来的 TB PPDU 不许超预算**（规格 §3.5、§8 第 6 条）。
  在一个开了 `guardInterval: { gi: 'quad' }` 的上行触发场景上跑 150 ms，
  断言**每一条基于触发的 PPDU 的 `txTimeNs ≤ 2_000_000 − signalExtNs`**
  （`mac.ts:964` 那个预算），以及由 `mac.ts:1494` 定尺的那一路
  `txTimeNs ≤ dur − signalExtNs`。
  **纯函数那一半也要有**：`maxPsduBytesFor('he', 11, 1, 2_000_000, 20, 1, TGI_NS.quad)`
  **严格小于** `maxPsduBytesFor('he', 11, 1, 2_000_000, 20, 1)`，
  且把算出来的字节数回灌 `txTimeModeNs('he', bytes, 11, { giNs: TGI_NS.quad })`
  **不超过预算**；而对基本档回灌也不超预算。
  **⚠ 这一条抓的是规格 §3.5 只点了 `symNs` 而没点前导码的那半句**：
  `nsym = floor((durNs − preambleNs) / symNs)`，四倍档下前导码多 8.8 µs，
  8_800 / 16_000 = 0.55 个符号，**所以只换分母会偏大一个符号**。
  实现必须同时换分子里的 `preambleNsFor(mode, giNs)`。

  **(b) 正确性：NAV 与时长字段跟着变。** 同一个场景上断言一条四倍档数据帧的
  `durationFieldNs` 覆盖它之后那一次短帧间间隔加响应，
  且 `exchangeNs` 算出的 `dataNs` 等于 `txTimeModeNs(..., { giNs })` 加信号扩展。
  **这一条是「集中注入」那个做法的证词**：六个 `airModeNs` 调用点里漏掉任何一个，
  时长字段就会短于它要保护的那段。

  **(c) 空转：`vht` 链路与 `nonht` 链路，分成两个 case**（规格 §5 第 2／2b 条）。
  在**同时有 `eht`–`eht` 与 `eht`–`vht` 链路**的场景上开 `quad` 跑两轮（开／关），断言
  **每一条链路世代为 `vht` 的 PPDU 的 `txTimeNs` 逐条相同、且 `frame.giNs` 不出现**；
  再用 `nonht` 换 `vht` 做**第二个 case**。
  **两代必须分成两个 case**，否则「两代都不动」看起来像一条断言而其实只测了一代。
  **基线已量过**（仪器 B）：`ampdu`（站点 `vht`）、`txop`（两台 `vht`）、`ifs`（站点 `nonht`）
  三个场景在四个 GI 档下 PPDU 条数 **243 / 702 / 765**、送达字节
  **1 290 120 / 1 003 860 / 583 696**、空口时间 **142.46 / 75.82 / 105.68 ms** 逐个相同。
  **这三个场景本身不要加 `guardInterval`**（它们没有 he/eht 链路，schema 会拒），
  所以这一条用 scratchpad 里构造的混合场景测，而上面那三组数只写进测试注释当基线。

  **(d) 空转：AMP 与 UWB 的帧**（规格 §5 第 3 条）。在一个同时有反向散射标签与
  `guardInterval: { gi: 'quad' }` 的场景上跑两轮（开／关），断言
  `AMP_BS_REPLY`、`AMP_BS_BOOT`、`AMP_RESULT` **逐字段相同**，
  且**没有一条 AMP/UWB 帧带 `giNs`**。
  依据：它们不是 OFDM Wi-Fi PPDU，`ppduLayout` 对它们走
  `ampPpduLayout` / `uwbPpduLayout`（`src/model/frameFields.ts:474-475`），
  `txTimeModeNs` 根本不经过。**这一条分不开，AMP 那两份 fixture 会无声地动。**

  **(e) 空转：欠载的场景，五个量**（规格 §5 第 4 条、§8 第 5 条）。
  在 `airtime` **自己的场景**上（`src/course/tier1/airtime.ts` 的 `scenario()`，
  `runUntil(150 ms)`，默认种子）跑四轮——基本、双倍、四倍、以及四倍（本刀的四倍**本来就**
  含 4× LTF，所以实际是三轮配置加一轮重复确认：**跑三档**，并在注释里写明
  规格 §2.2 的第四行「GI 3.2 + 4× LTF」在本实现里**就是** `gi: 'quad'`，
  因为 §1.4 那条配对把两者绑在一起，**引擎永不发出「3.2 µs GI + 2× LTF」那一档**。
  **⚠ 这是规格 §2.2 那张四行表与本实现之间唯一的形状差，不写清会被读成少跑了一轮**）。
  断言这五个量：
  PPDU 条数三档相同（**350**）、送达数据字节三档相同（**250 250**）、
  `RX_FAIL` 三档都为 **0**、`DROP` 三档都为 **0**、
  而 **PPDU 空口时间合计严格上升**，且四倍档相对基本档 **≥ +15 %**
  （已量过：26.88 → 27.72 → 30.94 ms，即 +3.13 % / **+15.11 %**）。
  **「有代价、无后果」要被明示地钉住，而不是让它看起来生效了。**
  **量具写进测试注释**：`airtime` 自己的场景、`runUntil(150 ms)`、默认种子、
  `TX_START` 里 `frame.mode ∈ {he, eht}` 且非 AMP / 非 UWB 的 PPDU。

- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** `WifiMacCfg` 加 `giNs?(): Ns | undefined`，`src/engine/simulation.ts`
  在建每条链路的 cfg 时填上
  `giNs: () => sc.guardInterval ? TGI_NS[sc.guardInterval.gi] : undefined`。
  **它是一个场景常量，不是一个按链路或按对端推出来的量**——这正是规格 §6.1 第二条
  要写成 `model-value` 的那件事：**场景写哪一档是场景作者定的，引擎不替它选**，
  而标准也不规定选择规则（只规定存在哪三档、各档符号时长、以及 `GI_TYPE` 由 TXVECTOR 指定）。
  **这一句写进 `WifiMacCfg` 那个方法的注释。**
- [ ] **Step 4:** **一处集中注入**，不逐点改六个调用点：

      private airModeNs(mode: PhyMode, bytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
        return txTimeModeNs(mode, bytes, mcs, { giNs: this.cfg.giNs?.(), ...opts }) + this.T.signalExtNs
      }

  `opts` 在后，所以显式传了 `giNs` 的调用点仍然赢；而**六个调用点
  （`mac.ts:658`、`:744`、`:760`、`:885`、`:962`，以及 `:726` 的定义本身）一个都不用改**。
  **这一步的注释要写明为什么集中注入**：漏掉任何一个调用点都会让时长字段短于它保护的那段，
  而「扫接口的调用方，不是任务的文件清单」这条纪律在这里的最好形式是让调用方根本没有机会漏。
- [ ] **Step 5:** 加一个私有助手，决定一帧要不要带这个字段：

      /** The GI this PPDU records — absent on the base GI and on every pre-HE format. */
      private frameGiNs(mode: PhyMode): Ns | undefined {
        const gi = this.cfg.giNs?.()
        if (gi === undefined || gi === TGI_NS.base || !GI_MODES.includes(mode)) return undefined
        return gi
      }

  在五个建数据帧的地方加 `giNs: this.frameGiNs(mode)`
  （`buildDataFrame` 的返回对象、`mac.ts:892`、`:970`、`:1503`，以及 MU 那一路的成员帧）。
  **`rts`/`cts`/`ack`/`ba`/`trigger` 一个都不加**：控制帧在这个引擎里是非 HT 的，
  而 §10.6 的参考速率路径必须保持对保护间隔失明（Task 1 Step 6 已钉）。
- [ ] **Step 6:** `FrameDesc.mbps` 在 `giNs` 在场时取那一档的列值：五个点的
  `mcsRateMbps(mode, mcs)` 改成 `mcsRateMbps(mode, mcs, this.frameGiNs(mode) ?? TGI_NS.base)`。
  **为什么必须这样**（规格 §3.6）：量过一条真实的 `ofdma-dl` MU PPDU，
  `giNs` 为 quad 时它的 `txTimeNs` 从 211 200 变成 240 000 ns，
  **而两个成员的 `bytes` 都还是 1434、`mbps` 都还印着 143.4**——
  那正是本仓库的招牌故障：**一条记录说的速率被它自己的时间线证伪。**
  按 Table 27-86 它该印 **121.9**。加一条断言：四倍档下一条 HE 数据帧的
  `mbps === 121.9`，而同一场景基本档下是 `143.4`。
- [ ] **Step 7:** `maxPsduBytesFor` 加第七个参数 `giNs: Ns = TGI_NS.base`，函数体改成

      const nsym = Math.floor((durNs - preambleNsFor(mode, giNs)) / symNsFor(mode, giNs))

  两个调用点（`mac.ts:964`、`:1494`）各传 `this.cfg.giNs?.()`。
  **注释里写明这不是修饰，是正确性**：它是这一刀唯一一处「不改就会错」的地方。
- [ ] **Step 8:** `npx tsc -b --force` + `npx vitest run` **全量**。
  **然后跑 `git diff --stat tests/fixtures/` 并读它的输出，必须是空的**
  （规格 §8 第 3 条：**这一步要跑，不要推**。结构性保证是哈希只吃 `t`/`seq`/`type`，
  而没有一个已发布场景写 `guardInterval`，所以时序不变；**跑它是为了证明我没把别的东西一起改了**）。
  **这一步跑完才允许进 Task 7 加 variant。**
- [ ] **Step 9:** 提交（显式路径：`src/engine/mac.ts`、`src/engine/simulation.ts`、
  `tests/engine/guard-interval.test.ts`、`tests/engine/guard-interval-round.test.ts`）。

---

### Task 5: 退役 `frame-anatomy-bytes` 那条现在为假的话（Task 4 之后立刻做）

**Files:** Modify `src/course/tier1/frame-anatomy-bytes.ts`；
Test `tests/course/frame-anatomy-bytes.test.ts`

**规格：§0.3、§7.3 前两行。**

**为什么单独提前**：`src/course/tier1/frame-anatomy-bytes.ts:122` 那条 `limits`
第一句「保护间隔这个选择在引擎里不存在」**从 Task 4 起为假**，而第二句的「一两成」
**本来就是错的**。等到最后再退役，中间每一次提交上课程都在说假话。

**量具（规格 §0.3，已复核）**：`txTimeModeNs('he', 230, 11, { widthMhz: 20 })`，纯算术、无随机。
这一课自己印的那一帧是 230 B 的 Wi-Fi 6 帧，课文说 **57.6 µs**：

| 保护间隔 | 这一帧 | 相对 57.6 µs |
| --- | --- | --- |
| 0.8 µs | 44 + 1 × 13.6 = **57.6 µs** | — |
| 1.6 µs | 44 + 1 × 14.4 = **58.4 µs** | **+1.39 %** |
| 3.2 µs（连 4× LTF） | 52.8 + 1 × 16 = **68.8 µs** | **+19.44 %** |

**所以这一课自己的那一帧，在它自己点名的那三个取值上，代价是 1.39 % 与 19.44 %，
而课文说的是「一两成」。**

- [ ] **Step 1:** 写失败测试，四条：
  **(a)** `limits` 里**不再出现**「这个选择在引擎里不存在」与「多花一两成的空口时间」
  （`not.toContain` 两头各一条）。
  **(b)** 新增那条 `model-value` 出现，且它说的是：保护间隔是一个**场景常量**，
  场景写哪一档是场景作者定的、引擎不替它选，**而标准也不规定选择规则**
  （只规定存在哪三档、各档的符号时长、以及 `GI_TYPE` 由 TXVECTOR 指定）。
  **(c)** 新增那条 `unmodelled` 出现，且它说的是：长保护间隔对抗的是**时延扩展**，
  而这个引擎不建时延扩展，**所以在这里它只有代价**。
  **(d)** 第 121 行那条 `model-value` 里，「13.6 µs 的符号」那半句改成
  **Table 27-13 的 T_SYM1 = 12.8 + 0.8 µs**、**不是代表值**；
  **前导码那半句不动**（它本来就对：40/44/48 µs 确实是代表值）。
  断言新说法 `toContain`、旧说法「13.6 µs 的符号是写在 PHY_MODES 里的常数」`not.toContain`。
  **(e)** `lessonChars` 与 `lessonMinutes` 两头量一遍：**`limits` 在 `mainPathChars` 之外，
  所以这一课的分钟数不该动**——核一遍，不要假设。
- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** 改课文。**是「删一条、加两条」，而不是「解除一条」**：
  `5facc9c` 刚盘点过 10 处 `until`，其中 3 处不解除任何东西——
  **这一次不要把「我改了一条 limits」记成「我解除了一条 limits」，也不要给这两条新 limits 加
  `until`**（它们记的是这一刀**建完之后**仍然成立的事，不是待办）。
- [ ] **Step 4:** **这一课印的 1.39 % / 19.44 % 这两个数，如果进了正文就必须由函数算出来**
  （规格 §4 的 `echoFacts` 规矩）。**推荐不进正文、只进 `limits`**：
  `limits` 不计 `mainPathChars`，而这一课没有分钟余量要花在这上面。
  若写进 `limits`，仍然用 `txTimeModeNs` 现算再格式化，不要写死字面量。
- [ ] **Step 5:** `npx vitest run tests/course/frame-anatomy-bytes.test.ts`，
  再跑 `wording.test.ts` 与 `readability.test.ts`。**不要用字符串存在比对去探首次出现规则**，
  让测试自己打印失败数组。
- [ ] **Step 6:** `npx tsc -b --force` + `npx vitest run` 全量。**fixture 零 diff。**
- [ ] **Step 7:** 提交（显式路径：`src/course/tier1/frame-anatomy-bytes.ts`、
  `tests/course/frame-anatomy-bytes.test.ts`）。

---

### Task 6: 噪声闸门——那条文本守卫（这是真正的闸门）

**Files:** Create `tests/course/guard-interval-noise.test.ts`

**规格：§5 第 6 条、§8 第 4 条、§8 第 9 条、§9 第 1 条。**

**这一刀最容易写出来的空测试，而且它会被写成正面结论。**
解调门限对保护间隔失明是签名级的（§2.1，Task 1 Step 1 (g) 已钉），
所以任何丢帧率差都是重采样——**而它两个方向都会出现**：
`capstone` 5.44 → 4.91 → 4.68 → **4.57 %**（像买到了可靠性），
`ru-diversity` 14.29 → 15.15 → 17.86 → **17.86 %**（像赔掉了），
`rate` / `rate-cost` 的送达字节 0 → −10.62 → **−27.05** → −13.23 %（**非单调**）。
**守卫不立，这一课会在它发布之后的某一次「验证」里变成一条假结论，而那一次没有人会怀疑尺子。**

**Interfaces — Consumes:** Task 1 的 `reqSinrDb` 失明断言（那一条留在
`tests/engine/guard-interval.test.ts` 里，本文件只引它的结论写进注释）。

**Interfaces — Produces:** 无导出。这是一个纯守卫文件。

- [ ] **Step 1:** 写守卫。**三条，第三条是硬条件。**

  **(i)** `reqSinrDb` 对全部 `he`/`eht` MCS 在两个 `symNs`（13 600 与 16 000）下
  **逐项相同，26 个值零差异**。
  （Task 1 已有一份；**这里再写一份是故意的**——这个文件是「为什么不许有第四条断言」的证词，
  证词里要带着它的前提。两份断言同值，不是重复，是两个读者各看一眼。）

  **(ii)** 在 `airtime` **自己的场景**上，`RX_FAIL` 与 `DROP` 在三档下**都为 0**
  （Task 4 Step 1 (e) 那一半，同一个量具：`runUntil(150 ms)`、默认种子）。

  **(iii) 一条按文本读源文件的守卫，照 `tests/course/selectivity.test.ts:417-427`
  已有的那条的写法，但把范围从两个文件扩成整个 `src/`。**
  递归读 `src/` 下全部 `.ts` / `.tsx`，断言这五个数**零命中**：
  `5.44`、`4.57`、`14.29`、`17.86`、`27.05`。

  **⚠ 匹配必须是边界锚定的，不能是朴素子串。** 已量过：朴素子串在今天的 `src/` 里
  **已经有两处命中**，两处都与保护间隔毫无关系——
  `src/course/uwb/uwb-position.ts:109` 的 `5.4439 m`（一条 UWB 距离）里含 `5.44`，
  `src/ui/Guide.tsx:142` 的注释 `// 4.578`（SP3 的一个倍数）里含 `4.57`。
  **所以朴素子串守卫会在它落地的第一天就红，而修它的办法不是开豁免名单，是把数锚住。**
  用这个判据（已量过：五个数在今天的 `src/` 里**全部零命中**）：

      const guard = (n: string) => new RegExp(`(?<![0-9.])${n.replace('.', '\\.')}(?![0-9])`)
      // 5.4439 不命中 5.44（后面还有数字）；4.578 不命中 4.57（同理）

  **(iv) 同一个文件里加第二条守卫，范围窄得多**：规格 §2.2 第一组那些**跨 36 课的池化数**
  （`5.14`、`15.41`、`17.78`，以及逐 PPDU 的 `1.22`、`5.82`、`3.66`、`17.47`、`4.70`、`14.09`、
  `17.07`、`19.44`）**不许进这一课与 `frame-anatomy-bytes`**——
  它们是这份规格的数，量在 **36 个场景、9463 条 PPDU** 上，而这一课只有一个场景。
  **这一条的范围只能是 `src/course/tier1/airtime.ts` 与
  `src/course/tier1/frame-anatomy-bytes.ts` 这两个文件，不能是整个 `src/`，三条理由各自致命：**
  - **`5.14` 在 `width.ts` 里是要印的。** 规格 §7.3 要求 `width` 新增那条 `limits` 写
    「连上 4× LTF 变 **−5.14 %**」，那是**仪器 B 在 `width` 自己的场景上量的送达字节变化**，
    与池化的 `+5.14 %`（仪器 A，36 课）**只是数字巧合**。
    **两条都合法，所以守卫不能按数字判，只能按文件判**，
    而 Task 8 要在那条 `limits` 里**写清它的量具**，让两个 5.14 分得开。
  - **`4.70` 已经在 `src/course/tier2/ru-diversity.ts` 里**（4b 的 p90 **4.70 dB**），
    与双倍 GI 的中位 **4.70 %** 同样只是巧合。
  - **`1.22` 已经在 `src/course/uwb/uwb-slot-budget.ts` 里三处**，与这一刀无关。
  **这三条理由要逐条写进测试注释**，否则下一个人会把范围「顺手」扩成整个 `src/` 然后让它变红，
  或者更糟——开一张豁免名单。
  **`19.44` 是例外**：它是 §0.3 那一帧（230 B）自己的数，量具是
  `txTimeModeNs('he', 230, 11, …)`，**那是单帧算术，不是池化**，
  所以 Task 5 若把它写进 `frame-anatomy-bytes` 的 `limits` 就是合法的。
  **于是 `19.44` 不进这条守卫**，而这一句也要写进注释。
  最终这条守卫的名单是：**`5.14`、`15.41`、`17.78`、`1.22`、`5.82`、`3.66`、`17.47`、
  `4.70`、`14.09`、`17.07`**，范围两个文件，锚定同上。

- [ ] **Step 2:** 跑它，确认 (i)(ii) 绿、(iii)(iv) 绿。
  **这一条是本计划里唯一一个「写完就该是绿的」测试**，因为它守的是一件还没发生的事。
  **所以它的失败演练要手动做一次**：在 scratchpad 里复制这个文件、往
  `src/course/tier1/airtime.ts` 的某条 `limits` 里临时塞一句「掉帧率从 5.44 % 降到 4.57 %」，
  跑守卫**确认它红**，**然后把那句撤掉**（`git diff` 确认 `src/` 干净）。
  **一个从没红过的守卫等于没有守卫**——这一刀最可能失败的地方不是实现，
  是这条守卫被当成形式。演练的输出贴进提交信息。
- [ ] **Step 3:** 在文件头的块注释里写明**为什么没有第四条断言可写**：
  **丢帧率在保护间隔各档之间的差值在本模型里恒等于重采样噪声**——
  时间线一变，`txSeq` 与时刻就变，衰落抽样的哈希键跟着变，于是同一条链路抽到的是另一组数。
  `capstone` 两个方向之一、`ru-diversity` 另一个方向、`rate-cost` 非单调，
  **三行里有两个方向、一处非单调，而解调门限一分贝都没动。**
  **那一段注释就是这条空转的证词。**
  **⚠ 注释里引这三组数时，只许写在注释里，不许写进任何断言字符串**——
  (iii) 自己会扫到 `src/`，而 `tests/` 不在它的范围里，所以注释是安全的；
  但一旦有人把它们搬进 `expect(...).toContain('5.44')`，守卫就失去意义。
- [ ] **Step 4:** `npx tsc -b --force` + `npx vitest run` 全量。**fixture 零 diff。**
- [ ] **Step 5:** 提交（显式路径：`tests/course/guard-interval-noise.test.ts`）。

---

### Task 7: `airtime` 这一课——一个 variant、三行数、一条 observe、一段正文、一行 fixture

**Files:** Modify `src/course/tier1/airtime.ts`、`tests/course/airtime.test.ts`、
`tests/fixtures/lesson-hashes.json`

**规格：§7.1、§7.2、§7.3 第三／四行、§8 第 8／9／10 条。**

**判断：挂在 `airtime` 上，不新开一课，落 25 分钟。**
三条理由（§7.1）：一门新课唯一诚实的 `why` 会是一句元命题，而那正是会让读者觉得被耍的形状；
`airtime` 的 `why` 已经是「一帧占多久空口」，而保护间隔在这个引擎里被建模的作用**恰好只有空口时间**；
`airtime` 的 `tryThis[0]` 已经逐字写着「拿 125.6 µs 的色块减去 44.0 µs 的前导码，
再把剩下的除以 13.6 µs」——**那个 13.6 就是 T_SYM1**，而这一刀要补的正是「它还可以是 14.4 或 16」。

**分钟预算是硬约束，已实测。** 量具：`lessonChars` / `lessonMinutes`
（`src/course/curriculum.ts:366` / `:410`，`CHARS_PER_MINUTE = 220`、`OBSERVE_MINUTES = 2`、
`TRY_MINUTES = 4`，四舍五入到 5 的倍数）。
**`airtime` 今天：`lessonChars = 1569`、`observe = 3`、`tryThis = 2`
→ raw = 1569/220 + 2×3 + 4×2 = 21.13 → `lessonMinutes = 20`**（三个数全部实测确认）。

| 加多少 observe / tryThis | 正文字数区间（落 25 分钟） | 今天的余量 |
| --- | --- | --- |
| **+1 observe（4 / 2）← 采用** | **1430 ≤ chars ≤ 2529** | **+960** |
| +1 observe +1 tryThis（4 / 3） | 990 ≤ chars ≤ 1649 | +80 |

**采用 +1 observe、不加 tryThis、正文净增不超过 960 字 → 落在 25 分钟。**
**不要落在 30**：`selectivity` 与 `ru-diversity` 已经各占满一个 30，
而 `airtime` 是一门 tier 1 的课——把它顶到上限，下一刀就动不了它。
（下界 1430 不是风险：今天已经 1569，而这一刀只加不减。）

**Interfaces — Consumes:** Task 1 的 `TGI_NS` / `symNsFor` / `preambleNsFor` /
`mcsRateMbps` / `txTimeModeNs`；Task 3 的 `Scenario.guardInterval`；Task 6 的两条文本守卫。

**Interfaces — Produces:**

    // src/course/tier1/airtime.ts
    export function giNumbers(): { giUs: number; name: string; symUs: number; frameUs: number; mbps: number }[]
    // airtime.variants: [{ label: '四倍保护间隔（3.2 µs）', scenario: () => Scenario }]
    // tests/fixtures/lesson-hashes.json 新增一行： "airtime#0": "<hash>"

- [ ] **Step 1:** 写失败测试（`tests/course/airtime.test.ts`），六组：
  **(a) 分钟预算**（§8 第 8 条）：`lessonMinutes(airtime) === 25` **且**
  `lessonChars(airtime) <= 2529` **且** `airtime.observe.length === 4` **且**
  `airtime.tryThis.length === 2`。**这一条要在测试里，不要靠人记。**
  **(b) variant 的形状**：`airtime.variants?.length === 1`，
  `variants[0].scenario()` 与 `airtime.scenario()` **只差一个 `guardInterval` 小节**
  （逐字段比较，断言 `nodes`、`rooms`、`queue` 等全部深相等，
  而 `variants[0].scenario().guardInterval` 等于 `{ gi: 'quad' }`、
  主场景的 `guardInterval === undefined`）。
  **(c) 三行数全部由函数算出来**（§4 的 `echoFacts` 规矩）：断言
  `giNumbers()` 的三行等于
  `[{ 0.8, '基本', 13.6, 125.6, 143.4 }, { 1.6, '双倍', 14.4, 130.4, 135.4 },
  { 3.2, '四倍', 16, 148.8, 121.9 }]`，**而实现里一个字面量都没有**——
  测试同时断言每一格都能用 `symNsFor` / `txTimeModeNs` / `mcsRateMbps` 独立重算出来。
  **并断言符号数在三档下都是 6**（§7.2：符号数不变，只有每个符号变长）。
  **(d) observe 那一项的三个数从真实的一轮读出来**：跑 variant 的场景与主场景各
  `runUntil(150 ms)`，断言 PPDU 条数都是 **350**、送达数据字节都是 **250 250**、
  而 PPDU 空口时间从 **26.88 ms** 涨到 **30.94 ms**，且课文里印的就是这三个数。
  **(e) 正文里有四个条号**：`§19.3.20`、`§27.3.23`、`§32.3.13`、`§36.3.22`
  （§1.3 那四处发送过程，**就是全书提到时延扩展的全部四处**），
  且正文里出现「时延扩展」与「5956」（802.11-2024 的页数）。
  **⚠ `§19.3.2`、`§19.3.3`、`§32.3`、`§36.3.x` 四个不到位或错的写法要 `not.toContain`**
  ——它们是 4a §1.4 的写法，Task 9 去改那份规格，而这一课从一开始就写对。
  **(f) 两条 `limits`**：`limits[0]` 里出现「44.0 µs 是『2× LTF + 基本保护间隔』那一档」
  与「四倍档下它是 52.8 µs」；新增那条 `unmodelled` 里出现「4× LTF」「8.8 µs」
  与「信道估计」——**4× LTF 的时间代价建了、它买的那样东西没建**。
  **这一条必须有，否则 8.8 µs 看起来是白付的**（而「白费」是禁词，要换说法）。
- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** 实现 `giNumbers()`。**零字面量**：

      const GI_ROWS = [
        { gi: TGI_NS.base, name: '基本' },
        { gi: TGI_NS.double, name: '双倍' },
        { gi: TGI_NS.quad, name: '四倍' },
      ] as const
      export function giNumbers() {
        return GI_ROWS.map(({ gi, name }) => ({
          giUs: gi / 1000,
          name,
          symUs: symNsFor('he', gi) / 1000,
          frameUs: txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs: gi }) / 1000,
          mbps: mcsRateMbps('he', 11, gi),
        }))
      }

  **`DATA_US = 125.6` 这个既有导出不要删**，但要让它等于 `giNumbers()[0].frameUs`
  （加一条断言把两者焊住），**于是「这一课印的 125.6」从此有一个量具**。
- [ ] **Step 4:** 加那个 `variants` 项。`label: '四倍保护间隔（3.2 µs）'`，
  `scenario: () => ({ ...airtime.scenario(), guardInterval: { gi: 'quad' } })`
  —— **`label` 之外零正文**，所以它不计 `mainPathChars`。
  **这是让读者真的跑一轮的全部成本。**
- [ ] **Step 5:** 加一个 `numbers` 的 `table` 小节，三行，head 是
  `['保护间隔', '一个符号', '这一帧（1430 B，六个符号）', '这一级的速率（Wi-Fi 6 MCS 11）']`，
  行由 `giNumbers()` 渲染。第三行第三格后面要跟一句**「前导码也从 44.0 变 52.8 µs」**
  （因为四倍档绑 4× LTF）。
  **量具写进表注**：前两列 Table 27-13；第三列 `txTimeModeNs`（20 MHz、单流、单用户）；
  第四列 Table 27-86 / Table 36-76 的三列速率栏——**而这是这一课最便宜的一个收获：
  读者第一次看到「速率」这个词原来有三个值。**
- [ ] **Step 6:** 加一段正文（在 `picture` 末尾或 `numbers` 之后，择一，别两处都加）：
  **「它买的是什么，而这里为什么看不见」**，带 §1.3 的四个条号，并点明一句：
  标准说保护间隔用来对抗**时延扩展**，而「时延扩展」这个词在 802.11-2024 的
  **5956 页里只出现在那一句话上（三页）**、在 802.11be-2024 的 1020 页里**只有一页**,
  **而这四处是同一句话**。
  **所以「这里看不见它」不是我们省略了一个可查的量，是标准本身只发布了这笔交易的一侧。**
  **这一段是这一课最该有、今天最缺的那一段。**
  **⚠ 用词：不要写「买到」（禁词）**；「代价」可以，「惩罚」「账」「更贵」「省钱」「白费」不行。
  再加一条 `observe`（第四条），逐字按 §7.2：
  **「这一轮和上一轮送到的字节一个都不差——350 条 PPDU、250 250 字节——
  而空口时间从 26.88 ms 涨到 30.94 ms。这个场景本来就没把空口占满，
  于是四倍保护间隔的代价全部落进了原本空着的那段时间里。」**
  三个数由 Step 1 (d) 那条测试从真实的一轮读出来钉住。
- [ ] **Step 7:** `limits` 与 `sources`（§7.3）：
  - `limits[0]` 的「13.6 µs 的符号」改成 Table 27-13 的 **T_SYM1 = 12.8 + 0.8 µs**，
    并补「**44.0 µs 是『2× LTF + 基本保护间隔』那一档**，四倍档下它是 52.8 µs」。
  - **新增一条 `unmodelled`**：4× LTF 的 8.8 µs 代价建了，
    **它买的那样东西（更好的信道估计）没建**——引擎没有信道估计误差这个量。
    **这一条和保护间隔那一句必须并列，不能只写保护间隔那一句。**
  - `sources` 加一条：三个取值与三个符号时长见 **§27.3.9 Table 27-13 / be §36.3.10 Table 36-18**；
    三列速率见 **§27.5 Table 27-86 / be §36.5.6 Table 36-76**；
    `GI_TYPE` 由 TXVECTOR 指定见 **§27.2 Table 27-1 / be §36.2 Table 36-1**；
    保护间隔用于对抗时延扩展见 **§19.3.20 / §27.3.23 / §32.3.13 / be §36.3.22**。
  **`limits` 与 `sources` 在 `mainPathChars` 之外**，所以这一步不吃那 960 字余量——**核一遍**。
- [ ] **Step 8:** **跑 `wording.test.ts` 与 `readability.test.ts`**，让它们自己打印失败数组。
  再跑 Task 6 那两条守卫，确认新正文**没有踩进**那十个池化数里任何一个。
- [ ] **Step 9:** **生成 fixture 那一行——这一步是这一刀唯一允许跑 `UPDATE_HASHES=1` 的地方。**
  `UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts`，
  然后 `git diff tests/fixtures/lesson-hashes.json` **逐行读**：
  **必须恰好是一行新增 `"airtime#0": "<hash>"`，插在 `"airtime"` 那一行之后**
  （`UPDATE_HASHES` 会整文件重写，键序是 `LESSONS` 顺序再加住宅预设，
  所以新 variant 落在它那一课后面）。
  **`uwb-record-hashes.json` 必须零 diff。**
  任何既有行变了就**还原、停下、报给控制者**。
- [ ] **Step 10:** **浏览器那一关**（§8 第 10 条，Task 2 Step 6 欠下的）。
  载入 `airtime` 的那个 variant，打开帧详情，确认
  **「6 个符号 × 16 µs」那一行与新增的「保护间隔 3.2 µs（四倍）」那一行**
  在 **939×511（展开）与 470×511（折叠）** 两个尺寸上都读得全。
  **`54ada93` 的教训：桌面那一列其实只有 344 px，所以折叠不是唯一的窄处**——
  两个尺寸都要看，截图存 scratchpad，结论写进提交信息。
- [ ] **Step 11:** `npx tsc -b --force` + `npx vitest run` **全量全绿**。
- [ ] **Step 12:** 提交（显式路径：`src/course/tier1/airtime.ts`、`tests/course/airtime.test.ts`、
  `tests/fixtures/lesson-hashes.json`）。

---

### Task 8: `ofdma-ul` / `ofdma-dl` / `width` 三课各一条 `limits`

**Files:** Modify `src/course/tier2/ofdma-ul.ts`、`src/course/tier2/ofdma-dl.ts`、
`src/course/tier2/width.ts` 及它们的测试

**规格：§7.3 第五／六／七行、§1.5、§6.1 第六条。**

**三条都在 `limits` 里，所以三课的 `lessonChars` 与 `lessonMinutes` 都不该动——核一遍，
不要假设**（`selectivity` 在 4b 里就是在这件事上差点跳档的）。

- [ ] **Step 1:** 写失败测试，三条新说法 `toContain`，并各量一次 `lessonMinutes`：
  **(a) `ofdma-ul` 新增一条 `model-value`**：引擎的上行触发式 PPDU 跑在 **0.8 µs** 上，
  而 **(LTF, GI) = (2×, 0.8) 对基于触发的 PPDU 不是强制组合**——
  HE TB 的强制集是 **(2×, 1.6) 与 (4×, 3.2)**，EHT TB 是 **(1×, 1.6)、(2×, 1.6)、(4×, 3.2)**
  （§27.1.1 / §36.1.1 那两份强制支持清单）。**这不违规**（(4×, 0.8) 在 EHT 侧挂在能力位
  `dot11EHT4xEHTLTFand0point8usecGIImplemented` 上、缺省 false；HE 侧挂在 ER SU 的支持上），
  但它是一条该写出来的事实。
  **这一条也是场景只开放两档的第二条理由**：1.6 与 3.2 恰好是 TB PPDU 那一行的强制集。
  **(b) `ofdma-dl` 新增一条 `out-of-scope`**：那一课的 MU PPDU 是**定长 12 个符号**
  （`src/course/tier2/ofdma-dl.ts:36` 的 `MU_SYMBOLS`），
  所以保护间隔只改它**多长**、不改它**装多少**。
  **带量到的两个数与它们的量具**：仪器 B 在 `ofdma-dl` 自己的场景上跑两轮
  （`runUntil(150 ms)`、默认种子、基本档对四倍档），
  PPDU 空口时间 **80.55 → 88.10 ms（+9.4 %）**、
  送达字节 **2 269 938 → 2 269 986（+0.002 %）**、两轮 `RX_FAIL` 都是 **0**。
  **本刀不改那个场景。**
  **(c) `width` 新增一条 `out-of-scope`**：宽信道上一帧的符号少，
  于是保护间隔的代价**几乎全在前导码那一项上**。
  **带量到的三个数与它们的量具**：仪器 B 在 `width` 自己的场景上，送达字节
  **−0.43 / −1.14 / −5.14 %**（双倍 / 四倍不含 4× LTF / 四倍含 4× LTF），
  `runUntil(150 ms)`、默认种子、零丢帧。
  **⚠ 这一格必须把量具写在数的旁边**：那个 **−5.14 %** 和规格 §2.2 第一组里
  跨 36 课池化的 **+5.14 %** **只是数字巧合**，两者的量具、符号、含义全不同
  （一个是这一课自己场景的送达字节下降，一个是 9463 条 PPDU 的空口时间上升）。
  Task 6 (iv) 那条守卫因此按**文件**判而不按数字判，而这一格的量具是让两个 5.14
  分得开的唯一办法。**这一句要写进这条 `limits` 自己的文字里，不只写在测试注释里。**
  **这一条让 4a 刚改对方向的那条 `limits` 多一个同向的例子**（`width.ts:158`，已带
  `until: 'selectivity'`，**不动它**）。
- [ ] **Step 2:** 跑它，确认失败。
- [ ] **Step 3:** 三条写进去。**三条都不加 `until`**：它们记的是这一刀建完之后仍然成立的事。
- [ ] **Step 4:** 三课的 `lessonChars` 与 `lessonMinutes` 各量一遍，**三个都不该动**。
- [ ] **Step 5:** `wording.test.ts` 与 `readability.test.ts` 全过；
  Task 6 那两条守卫全过（**注意 (iv) 的范围是两个 tier 1 文件，`width.ts` 不在其中**，
  所以 `−5.14 %` 合法；若有人把范围扩大，这一步会红——那是信号，不是故障）。
- [ ] **Step 6:** `npx tsc -b --force` + `npx vitest run` 全量。**fixture 零 diff。**
- [ ] **Step 7:** 提交（显式路径：三个课文文件与它们的三个测试文件）。

---

### Task 9: 收尾——改 4a 那份规格的三处

**Files:** Modify `docs/superpowers/specs/2026-10-03-selectivity-design.md`

**规格：§0.2(a)、§0.2(c)、§3.4 末句。**
**这三处都是改 4a 那份规格的，归这一个收尾任务，不要散在各处。**

- [ ] **Step 1:** **HT 那个条号。** 4a 把「保护间隔用于对抗时延扩展」那一句的 HT 出处写成
  `§19.3.2/§19.3.3`，**而那一句在 §19.3.20 PHY transmit procedure 里**。
  **三处要改**（已逐行定位）：
  - **第 8 行**（规格头部的已发布标准清单）：`§19.3.2/§19.3.3、§27.3.23、§32.3`
    → `§19.3.20、§27.3.23、§32.3.13`。
  - **第 127 行**：`（§19.3.2/§19.3.3 的 HT 发送过程、§27.3.23 的 HE 发送过程、§32.3 的 NGV 发送过程；`
    → `（§19.3.20 的 HT 发送过程、§27.3.23 的 HE 发送过程、§32.3.13 的 NGV 发送过程；`
  - **第 128 行**：`802.11be-2024 §36.3.x 的 EHT 发送过程是第四处` → `§36.3.22`。
    **第 652 行**同样有一处 `§27.3.23 / §36.3.x`，一起改成 `§36.3.22`。
  **为什么这一处值得改**：那张表（4a §1.4）**是 4a 整份规格的立论基础**
  （σ_τ 查不到，所以 4a 不需要它），**所以它的条号该是对的**。
- [ ] **Step 2:** **「一个新常数都不要」那两处。** 它想说的是「不需要**发明**」，
  说成了「不需要**新增**」。4c 要**六个**常数（`TDFT_EHT_NS`、`TGI_NS` 三档、
  `TLTF_2X_NS`、`TLTF_4X_NS`），**六个全有表号、零个 `model`**。
  - **第 655 行**：`空口时间跟着变一两成——**可跑、可读、一个新常数都不要**。`
    → 改成：空口时间跟着变（**双倍是半成、四倍连上 4× LTF 是一成七到两成**，见 4c §0.2(b)）；
    **要六个新常数，但六个全有表号、一个 `model` 都不要**。
    并把同一行上 `它就只是 PHY_MODES[*].symNs 从常数变成「DFT 周期 + 选中的 GI」` 这句
    标注为**被 4c §3.1 否掉的做法**：`symNs` 在 `src/` 里有六个读取点，
    其中两个（`ofdma-dl.ts:36`、`frame-anatomy-bytes.ts:49`）手上**没有场景**，
    而 `tests/` 里有 **47 行**直接提到 `symNs`、散在 **9 个文件**上。
    4c 的做法是**不动 `symNs`**、新增 `symNsFor`，并用一条测试把两者焊成别名。
  - **第 814 行**（那张切片表的 4c 行）：`取值已查到，**一个新常数都不要**；解除第六条 limits`
    → `取值已查到，**要六个常数而一个 model 都不要**；
    第六条 limits 不是「解除」而是「删一条、加两条」，而它现在就是错的（4c §0.3）`。
- [ ] **Step 3:** **`linkDbm` 那个行号。** 4a **第 701 行**写
  `` `linkDbm` 第 455–457 行已经立了这条规矩的写法 ``——
  **那个行号在 4b 合并之后失效了**，`linkDbm` 今天在
  **`src/engine/channel.ts:627`**（已核）。
  改成不带行号的写法：`` `linkDbm`（`src/engine/channel.ts`，`private linkDbm`）``，
  **并在同一句里写明为什么去掉行号**：一份规格引一个会随每一刀漂移的行号，
  就是在给下一个读者发一条迟早为假的指路。
- [ ] **Step 4:** 把这三处改动与 4c 的对应小节（§0.2(a)、§0.2(c)、§3.4）**互相引**，
  好让读 4a 的人找得到为什么改。
- [ ] **Step 5:** `npx tsc -b --force` + `npx vitest run` 全量（**只改 `docs/`，但要确认全绿**，
  因为这是这一刀的最后一次提交）。**fixture 零 diff。**
- [ ] **Step 6:** 提交（显式路径：`docs/superpowers/specs/2026-10-03-selectivity-design.md`）。
