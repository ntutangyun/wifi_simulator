# 切片 W3 重新立案：2.4 GHz 这条链路 —— **建议批，但脊骨要换**

2026-10-08。基线提交 `8666aae`（= `main`，已推；本 worktree `git status --porcelain` 空）。
实测基线：`npx vitest run` → **268 个文件 / 7 642 条全绿**；`npx tsc -b --force` → **exit 0**。
课程 **87 门**（`trackOf` 分：Wi-Fi **49**、AMP **5**、UWB **33**）、模块 **30**、阶段 **7**、
分钟总和 **1 850**、主路径汉字 **191 386**（均值 2 200）。

已发布标准 IEEE Std 802.11-2024。语料读法：
`D:\ai_patent_experiments\.claude\skills\wifi_patent_skill\references\ieee_standards\text\80211-2024.json`
的 `pages` 字典按**目录页码**取键，`toc/80211-2024.json` 的 `page` 与之同号。

```bash
# 基线复核
cd D:/wifi_sim/.claude/worktrees/feat-link-2g
npx vitest run --reporter=basic   # 268 files / 7642 tests
npx tsc -b --force                # exit 0
```

**这份规格的结论是四句话：**

1. **brief 给我的两条「立案前提已被证伪」，本身已经过时了。**
   backlog 第 365 行与覆盖表第 291–295 行**今天都已经是对的**：两处都写着
   「256 个场景里 4 个把 `sta` 放到 `'2g'` 上」与「`'2g'` 出现在 17 个场景里」，
   而且都标了 2026-10-05 由 W5 重测改正。我重跑了一遍，**两个数都复现**（§2、§3）。
   要改的不是这两句，而是 backlog 自己的**代价那一节**（第 384 行）——
   它拿一个**已被同一份文档的判据那一节换掉的**字数判据算账，
   是一处「新小节更正了、旧小节还在重述」（§6.1）。
2. **「33 门 UWB 课索引全部 +1」躲得掉，但不该躲。** 界面是「先按 `TIERS` 顺序、
   再按 `MODULES` 数组顺序」显示的，所以追加在数组末尾、靠 `tier: 2` 归档，**目录完全正确**
   ——两个方案的目录输出我逐行跑过，**除了我自己加的索引注记之外一模一样**（§4.4）。
   但 `CoursePanel.tsx:397` 的「上一课／下一课」按钮走的是 `COURSE_ORDER` 的下标，
   于是追加方案会让读者在 UWB 综合实践之后按「下一课」掉进一门 Wi-Fi 第三阶段的课。
   **省下的是 35 个文件 55 处机械改动、而且每一处都有测试兜着；付出的是一处永久的、
   没有任何测试看得见的读者可见错误。所以付那 55 处**（§4.5）。
3. **backlog 给这一刀定的脊骨（DIFS 28／AckTimeout 39／EIFS 88 那三个数）在一轮仿真里
   产生的后果恰好是零，而且是可证明的零。** 同一次交换、零退避：
   5 GHz 是 34 + 139.2 + 16 + 28.0 = **217.2 µs**，2.4 GHz 是 28 + 145.2 + 10 + 34.0 = **217.2 µs**
   ——两条链路的交换周期直方图**支撑集逐桶相同**（§5.2）。
   **照那个脊骨写，这一课就是一门「允许但空转」的课**：三个数，印出来，什么也不改变。
   换掉的脊骨是 **−6.5 dB**，而它的后果不是 backlog 预期的那一个（下一句）。
4. **而「能跑出数」跑出来了，数比预期好得多，机制也不是预期那一个。**
   同一间房、同一套墙、同一个几何：5 GHz 上两台站点互为隐藏节点（彼此 −82.8 dBm，
   差 `CCA_PD_DBM = −82` 0.8 dB），2.4 GHz 上那 6.5 dB 把它抬到 −76.3 dBm，
   **于是它们开始听得见对方的前导、却解不开——`RX_FAIL(lowSinr)` → EIFS 88 µs → 互相让路**。
   十个种子：5 GHz **4.639 Mb/s**、2.4 GHz **42.191 Mb/s**，**9.1 倍**；
   EIFS 记录 0 条对 6 903 条；碰撞 920 对 412（§5.6）。
   **这一课真正的题目是「换频段换掉了谁听得见谁」，而第五模块（@hidden／@rts-cts）
   已经把读者需要的那套机制交给他了。**

§1 标准查证，§2 口径与场景总数，§3 那 17 个场景与真实缺口逐项，
§4 索引 +1 躲不躲得掉，§5 能量出什么（全部实跑），§6 代价与闸门，§7 建议与疑虑。

---

## 1. 标准查证（brief 的章号我顶回去一条）

**brief 说「第 17/19 章那几个 ERP 的量」——章号不对。**
ERP 是**第 18 章**：目录 `18. Extended Rate PHY (ERP) specification`，第 3388 页。
第 17 章是 OFDM PHY（5 GHz），第 19 章是 HT。backlog 写的「第 18 章 ERP」是对的。

```bash
cd "D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/ieee_standards"
PYTHONIOENCODING=utf-8 python -c "
import json,re
d=json.load(open('toc/80211-2024.json',encoding='utf-8'))
print([e for e in d if re.search(r'Extended Rate PHY',e['title'])])"
```

### 1.1 Table 18-5「ERP characteristics」（§18.5.4，第 3400 页）

| 属性 | 标准值 |
| --- | --- |
| `aSlotTime` | 长时隙 20 µs，短时隙 9 µs（各加覆盖等级相关的 `aAirPropagationTime`） |
| `aSIFSTime` | 10 µs |
| `aSignalExtension` | 6 µs |
| `aRxPHYStartDelay` | ERP-OFDM **20 µs**；ERP-DSSS/CCK 长前导 192 µs、短前导 96 µs |
| `aPSDUMaxLength` | 4 095 octets |
| `aCWmin(0)` / `aCWmin(1)` / `aCWmax` | 31 / 15 / 1023 |

### 1.2 三个导出量的条号

| 量 | 标准出处 | 页 |
| --- | --- | --- |
| `DIFS = aSIFSTime + 2 × aSlotTime` | §10.3.7 DCF timing relations | 1932 |
| `EIFS = aSIFSTime + AckTxTime + DIFS` | §10.3.7 | 1933 |
| `AckTimeout = aSIFSTime + aSlotTime + aRxPHYStartDelay` | §10.3.2.11 Acknowledgment procedure | 1906 |
| 信号扩展适用的 PPDU 格式 | §10.3.8 Signal extension | 1934 |
| `aCWmin` 随特征速率集而变 | §10.3.9 | 1934 |
| CCA 前导检测 −82 dBm、能量检测 −62 dBm | §17.3.10.6（`engine/phy.ts:10` 的注引同一条） | — |

于是引擎那六个数全部对得上标准，逐个核：
`ERP_DIFS = 10 + 2 × 9 = 28`；`ackTimeout = 10 + 9 + 20 = 39`；
`eifs = 10 + 28 + 44 + 6 = 88`（`ACK_TX_TIME_6M_NS = 44 000`）。
5 GHz 的对照：`34`、`16 + 9 + 20 = 45`、`16 + 34 + 44 = 94`。

### 1.3 **两处标准与引擎不一致，而这一课必须说出来**

**（a）`aRxPHYStartDelay` 在这个引擎里对所有世代都是 20 µs，而标准对 HT 与 HE 给 24 µs。**
Table 19-25（HT PHY characteristics，§19.4.4，第 3493 页）与
Table 27-61（HE PHY characteristics，第 4361 页）都写 `aRxPHYStartDelay = 24 µs`。
按 §10.3.2.11，**一台 Wi-Fi 6 站点在 2.4 GHz 上的 AckTimeout 是 10 + 9 + 24 = 43 µs，不是 39 µs**
（5 GHz 侧同理是 49 µs 而不是 45 µs）。
引擎用的 20 µs 是第 17/18 章的 ERP-OFDM 值，统一用在所有世代上——**是一致的简化，不是错**，
但**这一课若在一个放着 Wi-Fi 6 站点的场景里印出「39 µs」，就必须带一条 `limits`**（§6.4）。

**（b）信号扩展在标准里不是「本频段自带」，是「本 PPDU 格式自带」。**
§10.3.8 把它挂在 `FORMAT` 上：ERP-OFDM、NON_HT_DUP_OFDM、HT_MF、HT_GF、HE_SU、HE_MU、
HE_ER_SU、HE_TB。之所以读起来像频段性质，是因为 Table 19-25 与 Table 27-61 把
`aSignalExtension` 本身定义成**按频段取值**（5/6 GHz 0 µs，2.4 GHz 6 µs）。
`@amp-ppdu` 主路径那句「本频段自带」因此是一个**正确的结论**，
而它的**理由**在标准里要绕一道。这一课可以把那一道补上，写在 `sources` 里即可。

**（c）ERP 的 `aCWmin` 是 31（长时隙）／15（短时隙），而引擎只有一个 CWmin。**
本仿真器用短时隙 9 µs，所以 15 是自洽的那一支。
`aPSDUMaxLength` 第 18 章是 4 095 octets，而 Table 27-61 的 HE 是 6 500 631 octets、
`aPPDUMaxTime` 5.484 ms——术语表最近刚修过那个 5.484（提交 `1a9dde0`）。
**这三条都在这一课的范围之外**，列在这里是为了说明「2.4 GHz 的差别不止六个数」，
而这一课只讲一台站点在一轮里感觉得到的那几个。

---

## 2. 口径：场景总数到底是几

最近几刀用过 251／256／264 三个数，三个都有过它的口径。**我用 256，口径是
「一门课里每一个可调用的 `scenario()`」**，即 `LESSONS` 的 `scenario` 加上每个
`variants[*].scenario`：

| 口径 | 值 | 构成 |
| --- | --- | --- |
| 课程场景（**本规格用这个**） | **256** | 87 门课各一个基础场景 + 169 个变体 |
| 加上家庭预设 | 263 | 256 + 7（`household:*`） |
| 加上 `defaultScenario()` | 264 | 263 + 1 |
| 立案当天（2026-10-05 之前） | 251 | 86 门课 + 165 个变体，W5 之后已失效 |
| `tests/fixtures/lesson-hashes.json` 的条数 | **263** | 94 个基础键（87 门课 + 7 个家庭预设）+ 169 个变体键 |

```bash
# 256 / 263 / 87 / 30 / 1850 / 191386 一次量全（scratchpad 脚本）
npx vite-node <scratchpad>/count.ts     # lessons 87 / modules 30 / base+variants 256
python -c "import json;d=json.load(open('tests/fixtures/lesson-hashes.json',encoding='utf-8'));\
print(len(d),len([k for k in d if '#' not in k]),len([k for k in d if '#' in k]))"   # 263 94 169
```

**backlog 第 427、457–459 行里的 251 不是错**：那几行明说是「写作当天」的值，并在括号里给了
W5 之后的新值。**不要去改它们**——那是一条历史记录，改了就看不出当时算错的是什么。

---

## 3. 真实缺口，逐项量

### 3.1 那 17 个场景，逐个

核法：遍历 `LESSONS` 的 `scenario()` 与 `variants[*].scenario()`（256 个），
取 `sc.nodes` 里 `linkId === '2g'` 的节点。

```bash
npx vite-node <scratchpad>/scan2g.ts
# total scenario callables: 256
# scenarios with ANY node on 2g: 17
# scenarios with a kind=sta node on 2g: 4
```

**17 个全部属于 M10「环境能量物联网（802.11bp）」，分属它全部五门课。**

| # | 课 | 变体 | 放在 2.4 GHz 上的是什么 | 读者在这门课里看得见什么 |
| --- | --- | --- | --- | --- |
| 1 | `@amp-intro` | （基础） | `tag-1`、`tag-2`（`kind: 'amp'`，`ampTag.mode: 'active'`，`nonht`） | 标签在 2.4 GHz 上回应轮询；SIFS 10 µs 印在主路径与 `sources` |
| 2 | `@amp-intro` | 上下行都用 1 Mb/s | 同上 | 同上 |
| 3 | `@amp-ppdu` | （基础） | `tag-1`、`tag-2` | **6 µs 信号扩展**印在字段表与公式（主路径 + `sources`） |
| 4 | `@amp-ppdu` | 上下行都用 1 Mb/s | 同上 | 同上 |
| 5 | `@amp-slots` | （基础） | `tag-1` … `tag-6` | 槽化回应；`limits` 里出现 9 µs 时隙 |
| 6 | `@amp-slots` | ACWE 1（ACW 1） | 同上 | 同上 |
| 7 | `@amp-slots` | ACWE 3（ACW 7） | 同上 | 同上 |
| 8 | `@amp-slots` | 两阶段：先报身份，再送读数 | 同上 | 同上 |
| 9 | `@amp-coexist` | （基础） | **`cam`（`kind: 'sta'`，`he`，满负荷上传）** + `tag-1`、`tag-2` | **AIFS 公式块**：`AIFS[AC] = SIFS + AIFSN × 时隙`，2.4 GHz 的 SIFS 10 µs、时隙 9 µs，AC_BK = 10 + 7×9 = **73 µs**、AC_BE = 10 + 3×9 = **37 µs** |
| 10 | `@amp-coexist` | 不加保护 | 同上 | 同上 |
| 11 | `@amp-coexist` | 每 20 ms 轮询一次 | 同上 | 同上 |
| 12 | `@amp-coexist` | 只有 Wi-Fi：没有标签，也没有轮询 | **只有 `cam`（`sta`，`he`）** | 同上；这一个变体里 2.4 GHz 上**只剩一台 Wi-Fi 站点**，而那一课仍然把它当干扰源 |
| 13 | `@amp-backscatter` | （基础） | `tag-1` … `tag-6`（`ampTag.mode: 'backscatter'`） | 反向散射清点轮 |
| 14 | `@amp-backscatter` | 激励 20 dBm | 同上 | 同上 |
| 15 | `@amp-backscatter` | 回应 1 Mb/s | 同上 | 同上 |
| 16 | `@amp-backscatter` | Q = 0：只开一个槽 | 同上 | 同上 |
| 17 | `@amp-backscatter` | 打开 Write | 同上 | 同上 |

**带 `kind: 'sta'` 的恰好是第 9–12 行那四个**，站点就是 `@amp-coexist` 的那台摄像头
（`src/course/amp/amp-coexist.ts:29`，`{ ...node('cam','Camera','sta',x,y,'he','saturated'), linkId: '2g' }`）。
**覆盖表第 303 行与 backlog 第 365 行写的就是这个，两处都对。**

**另外**：`'2g'` 的来源只有三处字面量——`amp-coexist.ts:29`（摄像头）、
`lessonKit.ts:212`（`tag()`）、`lessonKit.ts:235`（反向散射标签）。
`nodeLinks` 对 `kind === 'amp'` 无条件返回 `['2g']`（`caps.ts:95`），
所以**任何带 AMP 标签的场景都自动是一个 2.4 GHz 场景**，这是 17 这个数的全部来处。

**覆盖表第 280 行「没有一门 Wi-Fi 课把一台站点放到这条链路上」我核过，它是对的**：
`trackOf(@amp-coexist)` 返回 `'amp'`（M10 声明了 `track: 'amp'`），
按本仓库自己的判据那不是一门 Wi-Fi 课。这一行不用改。

### 3.2 逐个量：哪些量今天已经被教到了

**「教到了」的判据，分三级**（这一节每一行都按它判，不要压扁）：

- **印了**：这个数出现在某门课的**主路径**（`gradedProseTexts`：`why`、`outcomes`、
  `picture`、`numbers`、`observe`、`tryThis`、`quiz`）。这是唯一算「教到了」的一级。
- **提了**：出现在 `deeper`、`sources` 或 `limits`。那三处是折叠的专业深度，
  术语规则本身都不批改它们（`readability.test.ts` §「什么是被评级的」）。
- **用了**：场景里恰好取了这个值，而课文一个字没说。

核法（逐门课按四个段落桶做有边界的数字匹配，`(?<![0-9.])X(?![0-9])`）：

```bash
npx vite-node <scratchpad>/taught2.ts
```

| 量 | 引擎位置 | 今天 | 证据 |
| --- | --- | --- | --- |
| SIFS 10 µs | `phy.ts#ERP_SIFS_NS` | **印了** | `@amp-intro` 主路径+`sources`、`@amp-ppdu` 主路径、`@amp-coexist` 主路径 |
| 时隙 9 µs | `phy.ts#SLOT_NS` | **印了** | `@amp-coexist` 主路径（AIFS 公式块）；另有 11 门 Wi-Fi／UWB 课在 5 GHz 语境下印它 |
| 信号扩展 6 µs | `phy.ts#ERP_SIGNAL_EXT_NS` | **印了** | `@amp-ppdu` 主路径+`sources`，**全课程只此一门** |
| AIFS 37 µs（AC_BE@2.4 GHz） | `phy.ts#aifsNs` | **印了** | `@amp-coexist` 主路径，`10 + 3 × 9 = 37` |
| AIFS 73 µs（AC_BK@2.4 GHz） | 同上 | **印了** | `@amp-coexist` 主路径 |
| **DIFS 28 µs** | `phy.ts#ERP_DIFS_NS` | **一门都没有** | 全课程 13 处 `28 µs` 全是 24 Mb/s 下那帧 Ack 的空口时间（例：`tier1-project.ts:213`「回答本身是 28 µs」紧挨着「34 µs 的等待」）；**没有一处是 2.4 GHz 的 DIFS** |
| **AckTimeout 39 µs** | `phy.ts#ERP_2G.ackTimeoutNs` | **一门都没有** | `39 µs` 在 87 门课的四个段落桶里**零次出现** |
| **EIFS 88 µs** | `phy.ts#ERP_2G.eifsNs` | **一门都没有** | 唯一的 `88 µs` 在 `@mlo` 主路径，是「5 GHz 的倒数只是晚了 88 µs」，与 EIFS 无关 |
| **−6.5 dB 频段路损偏移** | `simulation.ts:51#LINK_EXTRA_LOSS_DB` | **提了，没印** | 只在 `@mlo-gain` 的 `limits`（`kind: 'unmodelled'`，`mlo-gain.ts:78`）。主路径零次 |
| **40 MHz 带宽上限** | `caps.ts:22-26#widthOf` | **一门都没有** | `40 MHz` 出现在 `@width`、`@streams`、`@ru-diversity`，全部是「四档带宽里的一档」；**`@width` 全文 `2.4` 出现 0 次** |
| `ERP` 这个词 | — | **一门都没有** | 四个段落桶里零次出现 |
| 5 GHz 侧的对照（34／45／94 µs） | `phy.ts#OFDM_5G` | **全部印了** | DIFS 34：8 门；AckTimeout 45：8 门；EIFS 94：4 门。**读者的锚已经在手上** |

**所以真实缺口是一句话：从标签那一侧教过，从 Wi-Fi 站点那一侧没教过；而没教的恰好是
DIFS 28、AckTimeout 39、EIFS 88、40 MHz 上限，和一个只在别人 `limits` 里露过脸的 −6.5 dB。**
覆盖表第 282–289 行说的就是这个，**它今天是准的**。

### 3.3 `tests/engine/link-2g.test.ts` 已经钉住了什么

12 条，三组：`ERP_2G` 与 `OFDM_5G` 的全字段相等、一个裸 MAC 上的 DIFS/SIFS/AckTimeout/EIFS、
一个完整 `Simulation` 里 2g 泳道的时序与速率。
**最后一条已经把 −6.5 dB 对 MCS 的影响钉成了等式**：
`expect(tx.frame.mcs).toBe(mcsForRssi('he', rssi5g + 6.5, undefined, 20))`。
**所以引擎这一侧零工作，而且这一课的每个数都已经有一条独立的引擎测试在旁边。**

### 3.4 编辑器里那个下拉框

`src/editor/FloorPlanEditor.tsx:922-931`。它只在
`kind === 'sta' && caps.generation !== 'vht' && caps.features.mlo !== true` 时出现，
选项是 `['2g','5g','6g']`，`'6g'` 再按世代过滤。
**这三个条件和 `caps.ts:91-101#nodeLinks` 一一对应**，不是巧合：
`nodeLinks` 第 98 行写 `n.linkId === '2g' && g !== 'vht'`，
所以**一台 Wi-Fi 5 站点即使 `linkId: '2g'` 也仍然跑在 5 GHz 上**
（802.11ac 只在 5 GHz），而界面干脆不给它这个选项。
**这是一条值得进 `deeper` 的真话，也是一个「配置得上、却什么也不改变」的现成例子。**

---

## 4. 「33 门 UWB 课索引全部 +1」躲不躲得掉

### 4.1 `MODULES` 是数组，带 `tier:` 字段

`src/course/curriculum.ts:119-184`。30 条，`tier` 序列今天是
`0×7, 1×5, 4×4, 5×10, 6×4`——**数组顺序已经与 `tier` 顺序一致**，而
`tier: 2`（第三阶段）与 `tier: 3`（第四阶段 · 研究）**名下都是零个模块**。

### 4.2 界面是按 `TIERS` 顺序，再按数组顺序

`src/course/CoursePanel.tsx:253-258`，一字不改地抄在这里因为这是整个问题的答案：

```ts
const shownTiers = TIERS
  .map((tier, ti) => ({
    tier, ti,
    mods: MODULES.map((m, mi) => ({ m, mi })).filter(({ m, mi }) => m.tier === ti && LESSONS.some((l) => l.module === mi)),
  }))
  .filter(({ mods }) => mods.length > 0)
```

**外层是 `TIERS` 的顺序，内层是 `MODULES` 的数组顺序，而且是先按 `tier` 筛后才排。**
所以一个 `tier: 2` 的模块无论落在数组第 12 位还是第 30 位，
都会显示在第二阶段之后、UWB 第一阶段之前。

**而读者看到的模块编号是 `mNo + 1`（`CoursePanel.tsx:288`），即它在**本阶段**内的序号，
不是数组下标。**所以数组下标从来不印给读者看。**

### 4.3 **答案：躲得掉。**

把新模块**追加在 `MODULES` 末尾（下标 30）**、只靠 `tier: 2` 归档，
**33 门 UWB 课的 `module` 字段一个都不用动**。
但有一个硬约束：`tests/course/lessons.test.ts:624`

```ts
expect(groups.map((g) => g.m)).toEqual(MODULES.map((_, i) => i))
```

`groups` 是从 `curriculum.ts` 源码里按出现顺序解析出的 `// M<n> · tier <t> · <title>` 头，
所以**分组头在 `COURSE_ORDER` 里的出现顺序必须等于 `MODULES` 的下标顺序**。
下标 30 ⇒ **这一课的分组必须排在 `COURSE_ORDER` 的最后**，在全部 33 门 UWB 课之后。

### 4.4 两个方案的目录输出，逐行比过

核法：按 `CoursePanel` 的 `shownTiers`／`trackHeadings`／`mNo + 1` 原样重算一遍目录。

```bash
npx vite-node <scratchpad>/panel.ts
```

**今天**（实测）：显示 5 个阶段——Wi-Fi 第一、第二，UWB 第一、第二、第三。
**`TIERS[2]`「第三阶段 · 频段与物理层保真度」与 `TIERS[3]`「第四阶段 · 研究」一个读者也看不到**，
因为两者名下都是零模块，被 `.filter(({ mods }) => mods.length > 0)` 滤掉了。
（brief 只说了 `TIERS[2]`；**`TIERS[3]` 也一样看不见**，这是我多核出来的一条。）

**方案 A（插在下标 12）与方案 B（追加在下标 30）的目录输出，除了我自己加的
`(MODULES[n], k lessons)` 注记之外，逐行一模一样。** 两者都得到：

```
## Wi-Fi
  第一阶段 · MAC 基础            模块 1–7
  第二阶段 · MAC 实战            模块 1–5
  第三阶段 · 频段与物理层保真度    模块 1 · 2.4 GHz 这条链路   ← 新
## UWB 测距
  UWB 第一阶段 · 测距基础        模块 1–4
  UWB 第二阶段 · 真实环境中的会话  模块 1–10
  UWB 第三阶段 · 下一步的草案     模块 1–4
```

**UWB 侧读者可见的模块编号在两个方案下都不变**（它们是按阶段内序号印的）。

### 4.5 **结论：躲得掉，但不该躲。依据是一处读者可见的错误。**

`src/course/CoursePanel.tsx:397-398`：

```tsx
<button disabled={idx <= 0} onClick={() => selectLesson(LESSONS[idx - 1].id)}>{L.prev}</button>
<button disabled={idx >= LESSONS.length - 1} onClick={() => selectLesson(LESSONS[idx + 1].id)}>{L.next}</button>
```

`idx = lessonIndex(lesson.id) = LESSONS.findIndex(...)`，而 `LESSONS = orderLessons(AUTHORED)`
就是 `COURSE_ORDER` 的顺序（`lessons.ts:210`、`:212-214`）。
**所以 `COURSE_ORDER` 不只是源码里的阅读顺序，它就是「下一课」按钮。**

- **方案 B 的代价：** 读者在 `@uwb-capstone`（UWB 综合实践，UWB 轨最后一门）按「下一课」，
  会落到这门 Wi-Fi 第三阶段的课上；在新课按「上一课」会回到 UWB 综合实践。
  **一处永久的、没有任何测试看得见的读者可见错误**，换来省下 55 处改动。
  顺带 `lessons.test.ts:301` 那条 `MODULES.map(m => m.tier)` 字面量会变成
  `[…, 6, 6, 6, 6, 2]`，而它上方的注释自称「The whole module list, **in order**」——
  那句注释会变成一句假话，而注释不是测试，没人会红。
- **方案 A 的代价（实测）：**

| 改什么 | 文件数 | 处数 |
| --- | --- | --- |
| `src/course/uwb/*.ts` 的 `module:` 字段 12…29 → 13…30 | **33** | **33** |
| `curriculum.ts`：插入一条 `MODULES` 条目 | 1 | 1 |
| `curriculum.ts`：`// M12…M29` 分组头 → `M13…M30` | （同上） | **18** |
| `curriculum.ts`：新分组头 `// M12 · tier 2 · <title>` + 课 id | （同上） | 1 |
| `tests/course/lessons.test.ts:301,308` 两条字面量数组 | 1 | 2 |
| **合计** | **35** | **55** |

```bash
grep -rln "module: " src/course/uwb/ | wc -l                       # 33
grep -c "^  // M1[2-9] · \|^  // M2[0-9] · " src/course/curriculum.ts   # 18
grep -rn "module: 1[0-9]\|module: 2[0-9]\|MODULES\[1[0-9]\]" tests/ src/ | grep -v src/course/uwb/
# → 只有 fading.test.ts:93 的 `module === 8`，不受影响
```

**这 55 处每一处都有测试兜着**：`lessons.test.ts` 的四条分组头测试会逐项核
`n`、`tier`、`title` 与「每个 id 落在它自己的 M 下」，一处写错当场红。
而且 **UWB 侧做过同一件事两次**（切片 3.5 与 3c 都是「插在中间而不是追加」，
`curriculum.ts:159-161`、`:168-171` 的注释就是上两次的交代），**所以这不是新风险，是一条走过两遍的路**。

**取方案 A。** 机械、可测、不可见；方案 B 省的是机械劳动，付的是读者。

---

## 5. 这一课能量出什么 —— 全部实跑，且结论是跑完才写的

**所有数字的场景口径**：`oneRoom()`（10 × 8 m，四面砖墙）或 `longApartment()` 或
`hallwayHouse()`；路由器 `(3, 4)`、`he`、`idle`；站点 `he`、`saturated`；
`seed` 见各行；`sc()` 默认 `servers: []`、`rtsThresholdBytes: 3000`。
**`ap.linkId` 与 `sta.linkId` 一起改**，否则 `linkPlanFor` 会建出两条链路。

### 5.1 ⚠️ 先说量尺：**翻 `linkId` 会换掉退避的随机流，所以单种子 A／B 不是一把合格的尺**

`simulation.ts:233/244/261`：MAC 的随机数是 `root.fork(hashStr(vid))`，
而 `vid = virtualId(n.id, link)`，`caps.ts:104-106` 规定 **`'5g'` 保留裸 id，其余加 `#link` 后缀**。
于是同一台站点在 5 GHz 上是 `sta-1`、在 2.4 GHz 上是 `sta-1#2g`，**`hashStr` 不同，退避序列不同**。

**我第一次量就被这把坏尺骗了一次**：单种子 300 ms 下 5 GHz 41.902 Mb/s、2.4 GHz 41.534 Mb/s，
看起来「2.4 GHz 慢 0.37 Mb/s」。跑 30 个种子之后（§5.3），那个差消失了。
**这一课的 `observe` 不许用单种子的吞吐差，`tryThis` 要把这件事说给读者。**

### 5.2 时序那四项的净和是**零**，而且是可证明的零

一次交换，零退避，EDCA 关（这样 IFS 记录的 `kind` 才是 `DIFS` 而不是 `AIFS`），
`he`、20 MHz、RSSI −46.7 dBm、`seed: 7`。逐事件时间戳实测：

| | 5 GHz | 2.4 GHz |
| --- | --- | --- |
| `IFS_START` / `DIFS` 时长 | **34.0 µs** | **28.0 µs** |
| 数据 PPDU（1 530 octets @ 143.4 Mb/s） | **139.2 µs** | **145.2 µs**（+6 µs 信号扩展） |
| `TX_END`(data) → `TX_START`(ack) 间隙 | **16.0 µs** | **10.0 µs** |
| Ack PPDU（14 octets @ 24 Mb/s，§10.6 控制响应） | **28.0 µs** | **34.0 µs**（+6 µs） |
| **零退避一次交换合计** | **217.2 µs** | **217.2 µs** |

```bash
npx vite-node <scratchpad>/run9.ts   # 逐事件时间戳
npx vite-node <scratchpad>/run4.ts   # 交换周期直方图
```

**交换周期直方图的支撑集逐桶相同**：两条链路都是 217.2、226.2、…、352.2 µs，
**16 个桶、步长 9 µs（一个时隙）**。
`−6 (DIFS) − 6 (SIFS) + 6 (数据扩展) + 6 (Ack 扩展) = 0`，一个微秒不差。

> **这正是 backlog 要求「先量再写」的那一条，而答案是三个可能性里的第三个：不是正、不是负，是零。**
> 并且：**照 backlog 的脊骨（那三个 IFS 数）写出来的课会是一门「允许但空转」的课。**
> 三个数在一轮里什么都不改变，而印出来的那张表会让读者以为改变了什么。
> **这一课必须把「净和是零」当成结论来教，而不是把那三个数当成卖点来列。**

### 5.3 近距离（MCS 封顶）：30 个种子，**无差别**

`oneRoom()`，站点 `(6, 4)`，RSSI −46.7 dBm，两边都跑到 `he` 的 MCS 11（143.4 Mb/s），
200 ms × 种子 1…30：

| 链路 | 均值 | 标准差 | 最小 | 最大 |
| --- | --- | --- | --- | --- |
| 5 GHz | **41.655 Mb/s** | 0.248 | 41.188 | 42.106 |
| 2.4 GHz | **41.683 Mb/s** | 0.237 | 41.004 | 42.106 |

差 **0.028 Mb/s**，远在一个标准差之内。**量不出差别，这是对的结论。**

### 5.4 远距离：−6.5 dB 换来两到三级 MCS，吞吐 **+53 %**

`longApartment()`，站点 `(14, 2)`，`buildLinkTable` 给 −75.2 dBm，200 ms × 种子 1…30：

| 链路 | 均值 | 标准差 | 选中的 MCS |
| --- | --- | --- | --- |
| 5 GHz | **18.003 Mb/s** | 0.084 | 2（25.8 Mb/s） |
| 2.4 GHz | **27.611 Mb/s** | 0.126 | 4（51.6 Mb/s） |

**+53.4 %。** 阶梯本身（`mcsForRssi('he', rssi, undefined, 20)`，20 MHz）：

| 5 GHz 的 RSSI | 5 GHz | 2.4 GHz（+6.5 dB） |
| --- | --- | --- |
| −46.7 dBm | MCS 11 · 143.4 Mb/s | MCS 11 · 143.4 Mb/s（**封顶，无增益**） |
| −60 dBm | MCS 7 · 86 Mb/s | MCS 10 · 129 Mb/s |
| −70 dBm | MCS 4 · 51.6 Mb/s | MCS 7 · 86 Mb/s |
| −75 dBm | MCS 2 · 25.8 Mb/s | MCS 4 · 51.6 Mb/s |
| −80 dBm | MCS 0 · 8.6 Mb/s | MCS 3 · 34.4 Mb/s |

**「6.5 dB 换来几级」的答案是「两到三级，而在近处换来零级」**——
两个方向的效应落在同一个数上，这是这一课的第二个题目。

**而它换不来覆盖**：沿 `longApartment()` 走 `x = 13 → 17`，
`x = 15.5` 处 RSSI −76.8 dBm（2.4 GHz 仍跑 21.665 Mb/s），
`x = 16` 处隔了一道墙，RSSI 掉到 −89.3 dBm，**两条链路都归零**
（−89.3 + 6.5 = −82.8，仍在 −82 dBm 前导检测门限之下）。
**所以这一课不许写「2.4 GHz 传得更远」**，在这套几何上它不成立。

### 5.5 40 MHz 上限：唯一一处 2.4 GHz 确实更差，而它差在带宽上，不差在时序上

`oneRoom()`，`eht` 两端都要 160 MHz，20 个种子，200 ms：

| 链路 | 协商带宽 | 选中的 MCS | 均值 |
| --- | --- | --- | --- |
| 5 GHz | 160 MHz | **9**（114.7 Mb/s） | **56.610 Mb/s** |
| 2.4 GHz | **40 MHz**（`widthOf` 封顶） | **11**（143.4 Mb/s） | **47.663 Mb/s** |

**上限的代价是 8.947 Mb/s，−15.8 %。**
而注意两件相反的事同时发生：5 GHz 开到 160 MHz，**噪声底抬高把它压到 MCS 9**，
2.4 GHz 在 40 MHz 上**守住了 MCS 11**，可它还是输——**因为 160 MHz 的车道数赢回来了更多**。
这一格把 `@width` 已经教过的「宽信道抬噪声底」和这一课的频段上限接在一起。

⚠️ **量尺注意：`widthOf(n)` 不带 `link` 参数时默认上限是 320 MHz，封顶不生效**
（`caps.ts:24`）。我第一次量就是这么量错的。
引擎里四个调用点全部传了 `link`（`simulation.ts:185,186,285,288`），所以封顶是活的；
**但这一课的测试若自己调 `widthOf`，必须传 `link`**，否则会量出一个假的 160。

### 5.6 **真正的发现：那 6.5 dB 换掉了谁听得见谁**

`hallwayHouse()`：A 房 — 砖砌走廊（路由器）— B 房。
路由器 `(5, 2)`、站点 `sta-1 (1, 2)`、`sta-2 (9, 2)`，都 `he`、20 MHz、满负荷。
`buildLinkTable` 给 `sta-1 ↔ sta-2` **−82.8 dBm**，`sta-1 → ap` −62.2 dBm。
而 `engine/phy.ts:44` 的 `CCA_PD_DBM = −82`。**那两台站点在 5 GHz 上差门限 0.8 dB。**

10 个种子、200 ms，EDCA 关／开两组：

| | 5 GHz（关） | 2.4 GHz（关） | 5 GHz（开） | 2.4 GHz（开） |
| --- | --- | --- | --- | --- |
| 吞吐均值 | **4.639 Mb/s** | **42.191 Mb/s** | **4.180 Mb/s** | **41.151 Mb/s** |
| 范围 | 3.300–7.151 | 41.317–43.456 | 2.142–5.630 | 39.841–42.840 |
| `RX_OK`(data) 合计 | 759 | **6 903** | 683 | **6 724** |
| `COLLISION` 合计 | **920** | 412 | **992** | 436 |
| `EIFS` 记录合计 | **0** | **6 903** | **0** | **6 724** |

**9.1 倍（EDCA 关）／9.8 倍（EDCA 开）。机制逐步可读：**

1. 5 GHz 上 −82.8 dBm **低于 −82 dBm 前导检测门限** → 两台站点**互为隐藏节点**，
   彼此的发送根本不可见，于是它们在路由器处对撞：单种子实测
   `RX_FAIL by node/reason: {"ap": {"collision": 42, "txDuringRx": 1}}`。
2. 2.4 GHz 上 −82.8 + 6.5 = **−76.3 dBm，高出门限 5.7 dB** → 它们**锁上了对方的前导，
   却解不开那一帧**（54 Mb/s 需要约 25 dB SINR，这里只有十几）：单种子实测
   `{"sta-2#2g": {"lowSinr": 354}, "sta-1#2g": {"lowSinr": 333}}`。
3. 解码失败按 §10.3.7 触发 **EIFS**，实测长度 **88 000 ns，一个值，没有例外** ——
   于是它们开始互相让路，碰撞从 920 掉到 412，`RX_OK` 从 759 升到 6 903。

```bash
npx vite-node <scratchpad>/run7.ts   # 单种子：RX_FAIL 的 node/reason 分布 + IFS 种类
npx vite-node <scratchpad>/run8.ts   # 10 个种子的吞吐、碰撞、EIFS 计数
```

**这一课的脊骨就是这一格。** 它一次给出三样东西：
**EIFS 88 µs 的可观测后果**（在 5 GHz 上它一次都不会出现）、
**−6.5 dB 的真实作用**（不是速率阶梯，是可见性门限），
以及一条**读者已经学过的机制的频段依赖**（M4 的 `@hidden`、`@rts-cts`
已经教过前导检测 −82 dBm 与隐藏节点，`@decode-thresholds` 教过门限本身）。

⚠️ **必须一并写明的刀锋**：这一格之所以这么漂亮，是因为 `hallwayHouse()` 的几何
恰好把站间链路放在门限之下 0.8 dB 处。**6.5 dB 跨过去绰绰有余，但这是一次刀锋演示，
不是一条普遍规律**。规格要求这一课**自建场景**而不是借 `hallwayHouse()`，
并在 `picture` 里把「这间房是为了跨过那条门限而建的」说出来——
否则读者会把它读成「2.4 GHz 总是赢」，而 §5.3 已经证明它在近处一点也不赢。

### 5.7 AckTimeout 39 µs，在一个完整 `Simulation` 里量出来

`longApartment()`，站点 `(16, 2)`，RSSI −89.3 dBm：数据帧到不了路由器，
于是站点每一次都等到超时。实测 `ACK_TIMEOUT.t − TX_END(data).t`，**唯一值**：

| 链路 | 超时间隔 | 200 ms 内超时次数 |
| --- | --- | --- |
| 5 GHz | **45 000 ns** | 103 |
| 2.4 GHz | **39 000 ns** | 111 |

（次数差来自 §5.1 的随机流，**不许当成结论**；间隔是确定的。）

### 5.8 这一课的「数」清单（每个都已实跑）

| 要印的数 | 值 | 在哪一轮里看得见 |
| --- | --- | --- |
| DIFS | 28 µs（对 34 µs） | `IFS_START` / `kind: 'DIFS'` 的 `untilNs − t`，EDCA 关 |
| AIFS(AC_BE) | 37 µs（对 43 µs） | 同上，EDCA 开，`kind: 'AIFS'`（`@amp-coexist` 已印过 37） |
| SIFS | 10 µs（对 16 µs） | `TX_END`(data) → `TX_START`(ack) |
| 信号扩展 | 每帧 +6 µs：数据 139.2→145.2、Ack 28.0→34.0 | `frame.txTimeNs` |
| **四项净和** | **0**（两条链路零退避交换都是 217.2 µs） | 交换周期直方图支撑集相同 |
| AckTimeout | 39 µs（对 45 µs） | `ACK_TIMEOUT.t − TX_END.t` |
| EIFS | 88 µs | `IFS_START` / `kind: 'EIFS'`，**只在 2.4 GHz 上出现** |
| −6.5 dB | 两到三级 MCS；近处零级 | `frame.mcs` / `frame.mbps` |
| 40 MHz 上限 | −15.8 %（56.610 → 47.663 Mb/s） | `negotiatedWidth(sta, ap, link)` + 吞吐 |
| 隐藏节点反转 | 4.639 → 42.191 Mb/s（9.1 ×） | `RX_OK` / `COLLISION` / EIFS 计数 |

---

## 6. 代价与闸门

### 6.1 **backlog 的 W3 代价那一节是一处「新小节更正了、旧小节还在重述」**

backlog 第 384 行写「**汉字：+2 400 ± 300**，**这超出今天的 1 202 字余量**，
所以**它必须排在 W0 之后**」。

**而同一份 backlog 的判据那一节（第 16–20 行）已经把这件事更正过了**，一字不改地引：

> **这一条的理由换过一次。** 立案当天它是「主路径只剩 1 202 字」（实测 188 798 / 上界 190 000），
> 也就是一个总字数上限；**切片 W0 把那个上限换掉了**，判据现在是逐课 (700, 4 400) 加
> 课数与模块数两条精确断言，而一门新课的 2 000–3 000 字落在那个区间的中间三分之一里。

**所以这不是一条没人发现的事实，是一处没跟着更新的旧句子**：W0 的那一节
（第 126–140 行的对照表）明确记了「全课程主路径字数 → 降级为 100 000 … 300 000 的健全性区间，
**不带任何手写数字**」，而 W3 那一节的代价段仍在按旧判据算账。
**要改的是第 384 行那一句**，不是判据。

实测今天的那条断言（`readability.test.ts:1179-1190`）：

```ts
expect(chars).toBeGreaterThan(100_000)
expect(chars).toBeLessThan(300_000)
```

今天 191 386，离两端都极远。**真正约束的只有逐课区间 `(700, 4 400)`**
（`readability.test.ts:1157-1178`），而那条测试的注释自己写着
「A new lesson lands at 2 000–3 000, in the middle third, **so this does not bind one**」。
实测最紧的两端：下端 `@relay-hops` 1 081（余 381），上端 `@ru-diversity` 4 030（余 370）。
**一门 2 400 字的新课在这条判据上有 1 700 字以上的余量。**

**brief 说的「最紧的两门是 `@rate` 1 个字、`@edca` 16 个字」量的是另一把尺**：
那是 `readability.test.ts:1138-1143` 的 `margins()`，
即**距离下一个五分钟取整桶还有多少字**，不是字数区间。
`@rate`、`@ofdma-ul`、`@uwb-reply-time`、`@uwb-m2m` 四门的 raw 分钟余量实测都是 0.0 分钟档。
**结论一致：别碰那两门，而这与新课的字数预算无关。**
raw 超过 30 分钟的恰好是 `@uwb-ancillary` 31.12 与 `@ru-diversity` 30.32 两门（切片 W2 钉的那一组）。

### 6.2 必然要改的精确断言（每一条都是显式编辑）

| 文件 | 断言 | 今天 | 之后 |
| --- | --- | --- | --- |
| `readability.test.ts:1152` | `ordered.length` | `toBe(87)` | `toBe(88)` |
| `readability.test.ts:1154` | `MODULES.length` | `toBe(30)` | `toBe(31)` |
| `readability.test.ts:1210` | 分钟总和 | `toBe(1_850)` | `toBe(1_850 + N)`，**N 在课文定稿之后量**，不许先写 |
| `lessons.test.ts:294-296` | `TIERS` 长度与 track 序列 | 7 / 四 wifi 三 uwb | **不变** |
| `lessons.test.ts:301-307` | `MODULES.map(m => m.tier)` 字面量 | 30 项 | 31 项，第 13 项插入 `2` |
| `lessons.test.ts:308-316` | `MODULES.map(m => m.title)` 字面量 | 30 项 | 31 项 |
| `lessons.test.ts:467+` | `TRACK` 逐课表 | 87 行 | **+1 行，`'wifi'`** |

**`readability-rules.test.ts:285` 的 `expect(ordered.length).toBe(87)` 也要改**
——brief 没提这一条，我核出来的。

### 6.3 `COURSE_ORDER` 的分组注释

新增一行 `// M12 · tier 2 · <模块标题>`，并把 `// M12`…`// M29` 十八行改成 `M13`…`M30`。
`lessons.test.ts:595-638` 四条测试逐项核 `n` / `tier` / `title` 与归属，写错当场红。
**`tier` 栏必须写 `2`**，模块标题必须与 `MODULES[12].title` 逐字相同。

### 6.4 `limits` 棘轮 292，零余量

判据（`readability.test.ts:926-983`，criterion Q）：
**一门课的 `limits[].text` 里点到的词表术语，若这门课自己的主路径从来没点到它，就记一笔债。**
今天 292 笔／76 门课，**棘轮就是这个数，没有余量**，抬它要人批。

**这一课的 `limits` 至少要有这四条，每一条点到的术语都必须进主路径：**

| `kind` | 内容 | 会点到的词表术语 | 主路径必须也有 |
| --- | --- | --- | --- |
| `model-value` | −6.5 dB 是本仿真器选的常数，整张链路表统一加减；真实频段差随距离与墙材质变 | 链路、调制与编码方式 | ✅（这一课的主体） |
| `threshold` | `aRxPHYStartDelay` 一律 20 µs，而 Table 19-25／27-61 对 HT/HE 给 24 µs；本课场景里那台 Wi-Fi 6 站点按标准应当是 **43 µs** 而引擎给 39 µs（§1.3a） | 确认帧、短帧间间隔、时隙 | 必须写进主路径 |
| `threshold` | 前导检测是 −82 dBm 一条硬门限，真实接收机是一条概率曲线；§5.6 那个反转因此是刀锋而不是台阶 | 前导检测、空闲信道评估 | 必须写进主路径 |
| `out-of-scope` | ERP-DSSS/CCK（1/2/5.5/11 Mb/s）与混合 BSS 的保护机制都没建模（后者就是 W4，已立案建议不批） | — | — |

**`LimitKind` 恰好四个**（`lessonKit.ts:80-89`）：`threshold`、`unmodelled`、`model-value`、
`out-of-scope`。**`regulation` 不是其中之一**，不要用。
**`until` 只许站在 `out-of-scope` 上**（`lessonKit.ts:99-106`），
而那条 `out-of-scope` **不该带 `until`**：W4 已被建议不批，`until` 是一句未来时的承诺，
承诺一门不会写的课就是撒谎。

### 6.5 术语与括号窗口

**好消息：这一课需要的词都已经在词表里，一个新术语都不用加。**
`src/course/readability.ts` 里已有：
`时隙`（`:621`）、`短帧间间隔/SIFS`（`:622`）、`分布式帧间间隔/DIFS`（`:625`）、
`扩展帧间间隔/EIFS`（`:626`）、`仲裁帧间间隔/AIFS`（`:627`）、
`空闲信道评估/CCA`（`:560`）、`前导检测`（`:562`）、`调制与编码方式/MCS`（`:556`）、
`链路`（`:682`）、`退避`（`:634`）。

**`信号扩展` 与 `ERP` 都不是词表术语**（实测）。
`@amp-ppdu` 主路径里 `信号扩展` 就是裸用的（`amp-ppdu.ts:69,86,93,132`）。
**建议保持这样，不要把它们加进 `ZH_TERMS`**：加进去会要求**全部 87 门课**在首次使用处补括号，
`@amp-ppdu` 四处首当其冲，而那是一次全课程扫荡，不是这一刀。

**括号窗口 40 字符**（`readability.ts:864-881`：括号必须开在术语首次出现处、
或其后 40 个字符之内；`bracketCarriesEnglish` 的 `at > end + 40` 就是这一条）。
**规格要求**：这一课主路径里上面每个术语的首次出现位置，**在课文定稿后逐个算出来并写进
它自己的测试**，不要靠「差几个字刚好过窗口」。做法：

```ts
// 这一课的测试里，逐术语断言首次使用处的括号距离，而不是只断言它通过
import { ZH_TERMS, bracketedAtFirstZhUse, gradedProseTexts } from '../../src/course/readability'
```

**首次出现处必须紧跟括号的，是这三个**（它们在主路径里几乎必然出现在第一两段）：
`链路（link）`、`分布式帧间间隔（DCF interframe space, DIFS）`、
`前导检测（preamble detection）`。

### 6.6 `picture` 的第一个 `watch` 块

`tests/course/kit.ts:138-140`：`picture.findIndex(b => b.kind === 'watch')` 必须 `< 3`。
**所以第一个 `watch` 最晚是 `picture` 的第三块。**
这一课的自然开法正好合规：第一块说「同一间房，只换一个下拉框」，
第二块给 §5.2 那张 217.2 µs 对 217.2 µs 的表，**第三块就是 `watch`：
跳到 2.4 GHz 泳道上那条 `kind: 'EIFS'` 的记录**——它在 5 GHz 上一条也没有。

### 6.7 fixture 与覆盖表

- **`tests/fixtures/lesson-hashes.json` 只许增行**：263 → 263 + 1 + （变体数）。
  建议 **3 个变体**（5 GHz 对照 / 2.4 GHz / 2.4 GHz 的隐藏节点那间房），即 263 → 267。
- **`docs/wifi-feature-coverage.md` 那张表现在有 296 条测试钉着**
  （`npx vitest run tests/course/wifi-coverage.test.ts` → 296 passed，实测）。
  切格器按裸竖线切格、认得转义竖线（提交 `1c11d63`、`8666aae`）。
  **要改的行**：第 303 行（`linkId: '2g'` 那一行从「引擎建了，无课」改成带课号）、
  第 304 行（40 MHz 上限）、第 305 行（频段路损差，−6.5 dB 从「提了」升级成「印了」）、
  第 558、560、561 行（第五节的无课项名单去掉三条）、第 661、676 行（D 项状态）。
  **第 291–295 行那段 2026-10-05 的更正记录不许动。**
- **第 280 行「没有一门 Wi-Fi 课把一台站点放到这条链路上」落地后就不再成立**，要改；
  第 282–289 行那段「从标签那一侧教过」的区分则要**保留并指向新课**。

### 6.8 不改引擎、不改既有课文

这一刀**零引擎改动**。`ERP_2G`、`LINK_EXTRA_LOSS_DB`、`widthOf`、`nodeLinks`、`timingFor`
全部就位且有 `tests/engine/link-2g.test.ts` 的 12 条钉着。
**也不改任何既有课的 `mainPathChars`**——`@amp-coexist` 与 `@amp-ppdu` 已经教的那五个数
（SIFS 10、时隙 9、信号扩展 6、AIFS 37、AIFS 73）**这一课要引用而不是重教**，
靠 `needs: ['ifs', 'cca', 'hidden', 'width']` 之类把读者的锚接上去
（`needs` 的每一项必须在 `COURSE_ORDER` 里更早，`readability.test.ts:113`）。

---

## 7. 建议与疑虑

### 7.1 建议：**批，但脊骨换成 §5.6**

**批的三条理由，每一条都是实测：**

1. **引擎全建好、测试全在位、零引擎工作**（§3.3）。
2. **backlog 的 W3 代价段按一个已被它自己换掉的判据算账**：它算的那个 1 202 字余量
   所依附的全课程字数上限，已由切片 W0 降级成一条不带手写数字的健全性区间
   ——而 backlog 的判据那一节（第 16–20 行）记了这件事，W3 那一节（第 384 行）没跟上。
   按今天的判据，新课在逐课区间上有 1 700 字以上余量（§6.1）。
3. **这一课量得出后果，而且是大后果**：9.1 倍的吞吐反转，机制可逐步读出，
   并且复用读者在第五模块已经学会的前导检测门限（§5.6）。

**但 backlog 定的脊骨要拒掉。** 「DIFS 28／AckTimeout 39／EIFS 88 三个数」在一轮里的净效果
是**可证明的零**（§5.2）。按这个脊骨写出来的是一门标准的「允许但空转」课：
配置合法、数字正确、后果为零。**新脊骨是三句话：**

- **换频段不换交换时长**（217.2 对 217.2，净和为零——先量后写的那个答案）；
- **换频段换链路预算**（两到三级 MCS，而在近处换零级，+53 % 或 ±0 %）；
- **而真正换掉的是谁听得见谁**（−82 dBm 门限两侧，隐藏节点变成互相让路，9.1 倍）。

第三句是这一课的收尾，前两句是通往它的路。而 40 MHz 上限（−15.8 %）是必须一并给的
反方向砝码，否则这一课会读成一篇 2.4 GHz 的广告。

### 7.2 第三阶段第一次出现在目录上，读者会看到什么

**今天**：目录上只有五个阶段，`TIERS[2]`「第三阶段 · 频段与物理层保真度」
和 `TIERS[3]`「第四阶段 · 研究」**都一个读者也看不到**（`CoursePanel.tsx:258` 把零模块的阶段滤掉）。
backlog 第 405–412 行只记了 `TIERS[2]`；**`TIERS[3]` 同样如此，这是我多核出来的一条。**

**落地之后**（§4.4 实测的目录输出）：
在「第二阶段 · MAC 实战」之下、UWB 轨标题之上，出现

```
第三阶段 · 频段与物理层保真度
  IEEE Std 802.11 · 已发布
  模块 1 · <新模块标题>
    ○ <新课标题>   · 25 分钟
```

**那个标签对这门课是诚实的**：它说的是「频段与物理层保真度」，
而这一课教的正是频段（2.4 GHz ERP 时序、−6.5 dB 频段损耗、40 MHz 上限）
和物理层保真度（前导检测门限的频段依赖、信号扩展进入 PPDU 时长）。
旧标签「底层 PHY」会在这一课落地的那一刻变成假话，而它已经在 2026-10-05 被改掉了。
`TIERS[2]` 的 `basis: ['ieee-802-11']` 也对——全部数据都出自已发布标准，
面板会印「已发布」而不是草案黄字（`CoursePanel.tsx:280-284`）。

**一条要补的诚实**：这个阶段**设计上就是一个一门课的阶段**。
backlog 第 589 行自己写了这件事（W6、W7 都建议不批，而它们是这个阶段的另两块）。
**规格要求**：`curriculum.ts` 里 `TIERS[2]` 上方那段注释要加一句，
说明这个阶段按 backlog 的 W6／W7 判定**不打算长成七门课**，
否则下一个读到「频段与物理层保真度」却只看见一门课的人会以为这里缺东西。

### 7.3 疑虑，五条

1. **§5.6 那个反转是刀锋，不是台阶。** `hallwayHouse()` 的站间链路恰好在
   −82 dBm 门限之下 0.8 dB。6.5 dB 跨过去绰绰有余，但换一套几何（比如站间差门限 10 dB）
   这一格就什么也不发生。这一课必须**自建场景并说出它是为了跨过那条门限而建的**。
   我更担心的是反面：**读者会把 9.1 倍记成「2.4 GHz 快九倍」**，而 §5.3 证明近处一点不快。
   这一课的 `why` 第一句就要把这件事挡住。
2. **AckTimeout 39 µs 在一个放着 Wi-Fi 6 站点的场景里，按标准应当是 43 µs**（§1.3a）。
   引擎的 20 µs `aRxPHYStartDelay` 是第 17/18 章的值，统一用在所有世代上。
   这一条**必须**进 `limits`，而那条 `limits` 点到的术语必须一并进主路径（棘轮零余量）。
   **如果写不下，第二个选择是场景里放一台 `nonht` 站点**——那样 39 µs 就是标准值，
   而代价是这一课的站点不再是读者熟悉的那一台 Wi-Fi 6。**这是一次内容判断，我不替它做。**
3. **`linkId` 的 A／B 不是一把干净的尺**（§5.1）。`virtualId` 给非 5 GHz 链路加后缀，
   后缀进 `hashStr` 进 `root.fork`，退避序列就换了。
   这一课的每一条 `observe` 都必须是**确定量**（时长、间隔、MCS 级、帧长）
   或**多种子均值**，不许是单次吞吐差。**我在这份规格里被这把尺骗过一次，写在 §5.1 里当记录。**
4. **「净和为零」这个结论本身可能被读者读成「那这四个数无所谓」。**
   它们在这个引擎的这个 1 530 字节、一帧一确认的交换里净和为零；
   换成 A-MPDU（一次聚合里一个 DIFS、一个 SIFS、一堆帧各付 6 µs 扩展），
   净和就不再是零而是正的——**2.4 GHz 会更慢**。
   我**没有量这一格**（它要开 `ampdu` 特性，是另一组运行）。
   **如果这一课要印「净和为零」，建议把聚合那一格也量出来当第二行**，
   否则「取决于你数的是什么」这句话只给了一个例子。
5. **方案 A 的 55 处改动里，33 处是在 33 个不同文件里各改一个数字。**
   每一处都有测试兜着，但这是一次要在一个提交里碰 35 个文件的改动，
   而且和课文本身毫无关系。**建议拆成两个提交**：
   先一个纯索引迁移（33 + 2 处，`MODULES` 插入空位之外什么都不加，
   263 条哈希逐条不变可证），再一个加课。
   第一个提交结束时测试必须全绿——`lessons.test.ts:320-323` 要求每个模块至少有一门课，
   **所以插入的那条 `MODULES` 条目和那门课必须在同一个提交里**。
   那么顺序反过来：**先在数组第 12 位插入条目并同时落课，再在同一个提交里改 33 个索引**。
   一个提交，35 个文件，没有别的走法。这一条我核过，是约束而不是偏好。

---

## 8. 验收

落地之后必须全部成立，每一条都给了命令：

```bash
cd D:/wifi_sim/.claude/worktrees/feat-link-2g
npx tsc -b --force                                  # exit 0
npx vitest run                                      # 268+ 文件全绿，条数 > 7 642
npx vitest run tests/course/wifi-coverage.test.ts    # 296 + 新增行带来的条数
npx vitest run tests/engine/link-2g.test.ts          # 12 条不变（这一刀不碰引擎）
npx vitest run tests/course/readability.test.ts      # 87→88、30→31、1850→新值
npx vitest run tests/course/lessons.test.ts          # 分组头 M0…M30 逐项对上
```

额外三条，不在既有测试里，**这一课的测试要自己带**：

1. **`limits` 棘轮不动**：这一课贡献 **0** 笔新债（`readability.test.ts` 那条 ≤ 292 保持绿）。
2. **§5.2 的零**：断言两条链路零退避交换都是 **217 200 ns**，并断言周期直方图支撑集相同。
   **这是这一课唯一一条「结论即断言」的测试**，因为那个零是它的论点。
3. **§5.6 的反转**：断言同一场景下 5 GHz 的 `EIFS` 记录数为 **0**、2.4 GHz 为正，
   且 2.4 GHz 的 `RX_OK`(data) 至少是 5 GHz 的 5 倍（10 个种子，留出余量而不是钉住 9.1）。
   **不要钉 42.191 这个均值**——它随种子集合变，钉倍数下界才是这一课的论点。
