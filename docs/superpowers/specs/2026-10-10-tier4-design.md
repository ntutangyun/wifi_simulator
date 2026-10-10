# 第四阶段 · 研究：立案

2026-10-10。基线 `79d1b12`。**只立案，不落地。**
**文中所有行号都是 `79d1b12` 上的**，不是某一份工作副本上的；文件路径见下。
> **测试机器的那几个导出，本文全部按导出名点名，不按文件名。**
> 理由是它 2026-10-10 刚刚换过一次家：`tests/course/limitsDebt.ts` 被拆成
> `tests/course/coverageNumbers.ts`（`LIMITS_DEBT_CEILING`、`MAIN_PATH_BAND`、`limitsRatchet`、`owed`、`limitsOf`）与
> `tests/course/corpus.ts`（`names`、`zhMainText`、`zhTermsFor`、`migratedLessons`、`MIGRATING`）。
> **文件名还会再变，导出名不会——而这份规格要活到 W13。**
> （同一时间 `readability.test.ts`、`wifi-coverage.test.ts`、`kit.ts` 与 `docs/wifi-feature-coverage.md` 也有改动；本文未动其中任何一份。）

这份文件回答五件事：
Wi-Fi 8 那一门教什么并过不过闸门、两条「交在别处」的条目要不要搬家、三门方法课的定位、
五处会先红的口径各是多少、以及做不做与先做哪一件。

**纪律照 `docs/wifi-course-backlog.md` 的两条**：每个数带它的量法（§9 是重跑脚本），
「立案并建议不批」的条目不许删、理由不许搬家。
**标准与草案正文一个字没抄**：条号、字段名、数值、文稿编号照既有做法引，句子不引。

---

## 0. 先核基线，以及对 brief 的更正

brief 的每个数都自己重量过。量法在 §9。

| brief 说的 | 实测 | 判 |
| --- | --- | --- |
| 基线 `79d1b12`、树干净 | `git log --oneline -1` = `79d1b12`；本刀开工时 `git status --short` **空** | **对**（brief 转述的六个未跟踪 `.png`／`.txt` 在 `D:\wifi_sim` 主检出里，**不在本 worktree**）|
| 270 文件 | `find tests -name '*.test.ts' \| wc -l` = **270** | **对** |
| 课程 88 门（Wi-Fi 50、AMP 5、UWB 33） | 88 门；`trackOf` 分组 = wifi 50 / amp 5 / uwb 33 | **对** |
| 课数 `toBe(88)`、模块数 `toBe(31)` | `readability.test.ts:1152`、`:1154`。**课数不止这一处**：`readability-rules.test.ts:289` 也 `toBe(88)`，且 `:281` 的 `it` 标题写着「walks all 88 lessons」 | **对，但漏了一处** |
| 分钟总和 `toBe(1_875)` | `readability.test.ts:1222`，实测合计 **1 875** | **对**（`docs/wifi-course-backlog.md:38` 那一行写的 `toBe(1 850)` 是陈的） |
| 逐课主路径 `(700, 4 400)`，上界严格 | 导出 `MAIN_PATH_BAND`（今在 `tests/course/coverageNumbers.ts`），`readability.test.ts:1170/1175` 用 `toBeGreaterThan`／`toBeLessThan` | **对** |
| `limits` 棘轮 292、余量 0 | `limitsRatchet()` 实测 `debt = 292`、`slack = 0`、`LIMITS_DEBT_CEILING = 292` | **对** |
| 第三阶段那一刀实测 **38 文件 / 58 处** | `.superpowers/sdd/w3-report.md:175-179`（W3 的**实现报告**）：「索引迁移是 38 个文件 58 处，不是规格算的 35 / 55」——规格的 grep 带冒号，漏了三处写死的 `.module).toBe(…)` | **对，而我先前引错了**：我引的是 `2026-10-08-link-2g-design.md:348` 那张表的 35 / 55，**而那是立案时的估算，已被落地当天的实测推翻**（§6.0）|
| 搬家「动不动 `TIERS`／`module` 索引／`trackOf`」 | 那两条条目在代码里**不存在任何表示**，见 §3。这个代价属于「插一个模块」，不属于搬家 | **前提不成立** |
| TGbn 语料 `text/`、`toc/` 各 2 761 个文件 | `ls text/*.json \| wc -l` = **2 761**，`toc/` 同 | **对** |
| 「2 761 份文稿」 | `catalog.json` 的 `n_documents` = **2 767**，`n_with_text` = **2 760** | **把文件数当成了文稿数**，见 §3.4 |
| 第四阶段零模块零课、面板滤掉 | `MODULES.filter(m => m.tier === 3).length` = **0**，课 **0**；`CoursePanel.tsx:253-258` 的 `.filter(({ mods }) => mods.length > 0)` 滤掉它 | **对** |
| UWB 第三阶段九门课 | tier 6 四个模块、**9** 门课 | **对** |
| `@capstone` 现 #54 | `COURSE_ORDER.indexOf('capstone') + 1` = **54** | **对** |
| e2e 36 条、`npx tsc -b --force` exit 0 | **没核。** 本刀不改一行代码，`tsc` 没有可动的输入；e2e 要起开发服务器，而口径禁止 | **未核，并声明** |

**另外核出三件 brief 没说的，都进了下面的正文**：
`citedBases` 会把 `802.11bn` 读成**已发布标准**（§2.6，这是本案最要紧的一处）；
`±10 %` 那一层对一门新课**根本不紧**，真正紧的是同一个 `it` 末尾那条 `all.length < 11500`（§5.5）；
`@edca` 的档位余量 16 字比 `@streams` 的 25 字更紧，而覆盖表 §17 那张表没有它这一行（§5.4）。

---

## 1. 第四阶段今天是什么

`src/course/curriculum.ts:105`：

```ts
{ track: 'wifi', label: '第四阶段 · 研究', basis: ['ieee-802-11'] },
```

它是 `TIERS[3]`。`MODULES` 里 `tier: 3` 的条目**零个**，课**零门**。
`CoursePanel.tsx:253-258` 先按 `tier` 筛模块、再把空阶段整条滤掉，所以**今天一个读者也看不见它**。
`tests/course/lessons.test.ts:300` 的注释已经把这件事写成设计而不是缺口：
「Tier 4 (research) still has none — a module arrives with its first lesson, so an index is never a
promise about a lesson that is not written.」

原定六条出自 `docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md:113-120`。
覆盖表 §15「结论二」已经把六条逐条审过。本案接着那张表往下走，不重述它。

---

## 2. Wi-Fi 8：教什么，以及过不过闸门

### 2.1 闸门到底是哪几条

brief 把它叫「W5 那道闸门」。实际是两层，都要过：

**第一层，backlog 自己的三条判据**（`docs/wifi-course-backlog.md:10-25`）：

1. **能跑出数。** 特性做完之后必须有一轮仿真跑得出它改变了的那个量，而那个量要能在课程里读出来。
   做不到的是讲解课，不是仿真。
2. **不需要发明数字。** 标准没给、语料库也没给的常数，一律留在「范围决定」里。
3. **要说出它花多少汉字，以及这笔汉字从哪来。**

**第二层，逐课的结构闸门**，它比第一层硬，而且它是代码：

- `src/course/lessonKit.ts` 的 `Lesson` 接口里 `scenario: () => Scenario` 是**必填**，
  `jumps`、`observe`、`tryThis`、`limits` 也是。**没有「纯讲解课」这个形状。**
- `tests/course/kit.ts:134-141`：`picture` 的**前三块之内**必须有一块 `kind: 'watch'`——
  读者在机理讲完之前就被送去仿真器。
- `tests/course/kit.ts:144-150`：`for (const j of l.jumps) expect(rs.some(j.find)).toBe(true)`——
  **每一个跳转目标都必须在基准跑里真的出现。**

所以 brief 那个二选一（「关于草案本身的课」还是「关于引擎行为的课」）在这个仓库里
**没有第一个选项**：一门课必须有一个场景、一轮跑、以及跑里真的有的记录。

### 2.2 UWB 第三阶段那九门课是怎么过的——**它们不是草案课**

brief 建议去读它们怎么处理「草案里的东西、引擎建了多少」。读完的结论是：
**那九门课每一门都有自己的场景构造器，背后是自己的引擎代码。**

| 课 | 场景构造器 | 引擎 |
| --- | --- | --- |
| `@uwb-mms`、`@uwb-mms-numbers` | `uwbMmsScenario(...)` | `src/uwb/mms.ts`、`device.mms.ts` |
| `@uwb-nba`、`@uwb-nba-coexist` | `uwbNbaScenario(...)` | `src/uwb/nb.ts` |
| `@uwb-ssbd` | `uwbSsbdScenario(...)` | 感知延后，`src/uwb/` 内 |
| `@uwb-uwbd`、`@uwb-acquisition` | `uwbUwbdScenario`／`uwbAcquisitionScenario` | 两套控制面、SP0 捕获 |
| `@uwb-subrounds` | `uwbSubroundsScenario(...)` | 非交织子轮、固定回复时间 |
| `@uwb-capstone` | 读者自己决定的场景 | 以上全部 |

**那条路是「先建，再教」，不是「读草案」。** 工作组过程那一层是**长在机制课里面的**，
不是一门以它为题的课：`@uwb-ssbd` 教「先听后发是可选的」，依据是
「十三条要把 may 改成 shall 的意见全部被否决」（15-26/0244r1）；
`@uwb-subrounds` 给一个机制定价，依据是「一条**已被提出者撤回**的意见」（15-25/0331r1）。
再加 `BASES` 的 `draft` 标志、面板上那条琥珀色依据行（`CoursePanel.tsx:281`）、
课内那个 `draftMark`「草案，内容可能变动」（`:440`）、以及 `CONTRIBUTIONS` 那 22 条注册表。

**所以 Wi-Fi 8 照搬不了这条路——照搬的前提是引擎里先有东西。**
brief 自己也写了这一句，核过，成立。

### 2.3 11bn 最大的那几块够不着，而且是两重够不着

**第一重：它们要的结构这个引擎明确拒绝。**
语料库里按文稿数排前几位的 MAC 题目（`catalog.json` 的 `topics`，量法见 §9）：

| 题目 | 文稿数 | 它要什么 | 引擎 |
| --- | --- | --- | --- |
| mapc（多接入点协同） | 715 | 第二个接入点 | **拒绝** |
| power-save | 554 | 信标／TIM／TWT | 未建（标准对齐 E 项未开始） |
| co-bf（协同波束成形） | 500 | 第二个接入点 + 探测 | **拒绝** |
| npca（非主信道接入） | 480 | 邻居 BSS、主/辅 20 MHz、每 20 MHz 的 CCA、信标 | **拒绝 + 未建** |
| mlo | 443 | 已有（`@mlo`、`@mlo-gain`） | 部分 |
| roaming | 391 | 关联与漫游 | 未建 |
| co-sr / co-tdma / co-rtwt | 337 / 287 / 150 | 第二个接入点 | **拒绝** |

那个「拒绝」是一条硬拒绝，`src/model/scenario.ts:1650-1653`：

```ts
const aps = sc.nodes.filter((n) => n.kind === 'ap')
const wifi = sc.nodes.filter((n) => n.kind === 'sta' || n.kind === 'amp')
if ((wifi.length > 0 || aps.length > 1) && aps.length !== 1) {
  ctx.addIssue({ ..., message: `场景必须正好有一个 AP（现在有 ${aps.length} 个）：...` })
}
```

而解除它正是切片 **W10**，`docs/wifi-course-backlog.md:720` 起已经**立案并建议不批**，
理由是「它不是一刀，是一次结构改造」。
**所以 NPCA／MAPC／co-* 的代价 = W10 的全部代价 + 它们自己的。**

**第二重：草案自己还没定下它们的数。**
实测 SFD r19（`tables/sfd_full.md`，2 739 行，文稿 `11-24/0209r19`）里 `TBD` 共 **143 处**，
而它们压倒性地落在 MAC 一侧：

| SFD 小节 | 行数 | `TBD` |
| --- | --- | --- |
| Seamless Roaming | 138 | **36** |
| Coordinated beamforming (Co-BF) MAC | 155 | **16** |
| Non-primary channel access | 67 | **14** |
| Enhanced EDCA | 32 | 9 |
| Coordinated TDMA | 44 | 8 |
| Multi-AP Coordination Framework | 67 | 6 |
| Distributed-tone RU | 368 | **2** |
| Unequal modulation and new MCS | 66 | **0** |
| LDPC enhancement | 92 | **0** |
| Enhanced long range extension | 183 | 3 |

NPCA 的退避规则原文就是一个 `TBD`：
「shall initialize CW_NPCA[AC] to TBD value and pick a new backoff counter (BO_NPCA) randomly
between 0 and CW_NPCA[AC]」。
**一门 NPCA 课要先发明一个竞争窗口——判据 2 在源头就不过。**

### 2.4 唯一够得着的那一件：**四个新 MCS 档**

SFD r19 的 PHY 一半是硬的，而其中落在「这个引擎已经承载的那个量」上的只有一件。

**它是什么。** Motion #216 把四个新 MCS 定为必选：
QPSK R=2/3、16-QAM R=2/3、16-QAM R=5/6、256-QAM R=2/3
（SFD 自己的编号是 MCS 17 / 19 / 20 / 23）。

**为什么它一个数都不用发明。** 引擎的解码判决是
`src/engine/phy.ts:414-416`：

```ts
export function reqSinrDb(mode: PhyMode, mcs: number): number {
  return modeEntry(PHY_MODES[mode].sensDbm, mode, mcs) - noiseDbm(20, STANDARD_NF_DB)
}
```

`sensDbm` 就是标准的最小灵敏度那一列。**而 SFD r19 的 Motion #417 恰好公布了这一列**，
20 / 40 / 80 / 160 / 320 MHz 五档都有。两件实测：

1. **它对既有档位与引擎的表逐行一致**（同一把尺、同一列）：

| MCS | SFD r19 20 MHz | 引擎 `HE_SENS`／`EHT_SENS` |
| --- | --- | --- |
| 1 QPSK 1/2 | −79 | −79 |
| 2 QPSK 3/4 | −77 | −77 |
| 3 16QAM 1/2 | −74 | −74 |
| 4 16QAM 3/4 | −70 | −70 |
| 5 64QAM 2/3 | −66 | −66 |
| 7 64QAM 5/6 | −64 | −64 |
| 8 256QAM 3/4 | −59 | −59 |

2. **`ndbps` 也不用发明**，它是 234 个数据音调 × 每音调比特数 × 码率，
   而这条等式对引擎现有的十四档**逐档成立**（实测 14/14 一致，§9 的 `ladder2.ts` 打印全表）。
   于是四个新档是 312 / 624 / 780 / 1248，全是整数。

**它能量出什么——这是现在就能跑的，不用先建引擎。**
把四个新档按所需 SINR 插进今天的阶梯（`reqSinrDb` 的参考噪声是 `noiseDbm(20, 10) = −90.99 dBm`）：

| 所需 SINR | 档 | 灵敏度 | N_DBPS | Mb/s | 比下一档低的那一档高多少 |
| --- | --- | --- | --- | --- | --- |
| 11.99 | MCS1 | −79 | 234 | 17.2 | — |
| **12.99** | **MCS17 QPSK 2/3** | **−78** | **312** | **22.9** | **←11bn** |
| 13.99 | MCS2 | −77 | 351 | 25.8 | |
| 16.99 | MCS3 | −74 | 468 | 34.4 | |
| **19.99** | **MCS19 16QAM 2/3** | **−71** | **624** | **45.9** | **←11bn** |
| 20.99 | MCS4 | −70 | 702 | 51.6 | |
| **21.99** | **MCS20 16QAM 5/6** | **−69** | **780** | **57.4** | **←11bn** |
| 24.99 | MCS5 | −66 | 936 | 68.8 | |
| 26.99 | MCS7 | −64 | 1170 | 86 | |
| **30.99** | **MCS23 256QAM 2/3** | **−60** | **1248** | **91.8** | **←11bn** |
| 31.99 | MCS8 | −59 | 1404 | 103.2 | |

每个新档自己占住的那个 SNR 窗口，以及它在那个窗口里顶掉的档：

| 新档 | 它占的窗口 | 宽度 | 今天这个窗口跑的是 | 每符号数据比特变化 |
| --- | --- | --- | --- | --- |
| MCS17 QPSK 2/3 | [12.99, 13.99) dB | 1.00 dB | MCS1（234） | ×**1.333** |
| MCS19 16QAM 2/3 | [19.99, 20.99) dB | 1.00 dB | MCS3（468） | ×**1.333** |
| MCS20 16QAM 5/6 | [21.99, 24.99) dB | **3.00 dB** | MCS4（702） | ×**1.111** |
| MCS23 256QAM 2/3 | [30.99, 31.99) dB | 1.00 dB | MCS7（1170） | ×**1.067** |

**所以这门课的题目是：一条速率阶梯的档位是一个设计选择，
而一个工作组对「余量被扔掉了多少」给出的答案是在 2/3 与 5/6 上各加几档。**
`@mcs-ladder`（#4）已经教了阶梯与那套算法（灵敏度 + 90.99 dB、再加 3 dB 余量），
`@rate-fallback`、`@rate-cost` 教了降档与它的代价。**没有一门课能问「这个阶梯本身粗了多少」。**

**三条诚实话，必须进 `limits`：**

- **一个 1 dB 宽的窗口要把站点摆在一条 1 dB 的 SNR 带里**，这在确定性引擎里做得到
  （SNR 随距离连续），但那是**特意摆的位置**，要按 `kind: 'out-of-scope'` 说明。
- **更像样的那次测量在起伏打开之后**：SNR 会在窗口之间游走，细阶梯才被真正用上，
  而「变坏/变好的是分布的尾部而不是平均」这个论证 `@fading`、`@ru-diversity` 已经建立了量法，
  照它们的做。
- **`RATE_MARGIN_DB = 3`（`phy.ts:364`）对所有档位同等平移，所以它不改窗口宽度**——
  这一条要写明，否则读者会以为 3 dB 余量把 1 dB 的好处吃掉了。

**判据逐条过：** 判据 1 过（跑得出 N_DBPS 与吞吐的差，且记录里读得出选了哪一档）；
判据 2 过（灵敏度在 SFD 里、N_DBPS 可推、一个数都不发明）；
判据 3 见 §6 的汉字估计。

### 2.5 要建什么，代价多少——**而这不是「不用建引擎」**

**要建的是一个第五代 `Generation`／`PhyMode`（下称 `'uhr'`），带十八档的阶梯**，
**不是**把四个档追加进 `eht` 的数组。

> **追加进 `eht` 必须拒绝，理由是它就是 W7 那个病。**
> `bestMcs` 会给现有链路选出不同的档，于是
> `tests/fixtures/lesson-hashes.json` 那 271 条、以及所有引号里的时间戳全部要重标定。
> 新开一个代号则**零重标定**：没有任何已发布场景声明 `'uhr'`。

**爆炸半径，实测。** `Generation` 是 `src/model/types.ts:13` 的四元联合，全仓 101 处提到 `'eht'`。
加第五个成员要动的是**穷举点**：

| 要改什么 | 位置 | 处数 | 编译器看得见？ |
| --- | --- | --- | --- |
| `Record<Generation, …>` 字面量 | `model/caps.ts:17` `MAX_WIDTH`、`:43` `GEN_RANK`、`:45` `GEN_LABEL`、`:53` `GEN_FEATURES`、`model/households.ts:74` `DEVICE_RADIO`、`ui/i18n.ts:545` `generations` | 6 | **是**（`tsc -b` 逐个点名） |
| `Record<PhyMode, PhyModeInfo>` | `engine/phy.ts:196` `PHY_MODES` | 1 | **是** |
| 类型别名本身 | `model/types.ts:13`、`engine/phy.ts:164` | 2 | — |
| zod 枚举 | `model/scenario.ts:827` | 1 | 否（运行时） |
| 控件选项表 | `course/widgets/common.tsx:4` `MODE_OPTIONS` | 1 | 否 |
| 测试里的字面量代号表 | `course/widgetModel.test.ts:30`、`engine/guard-interval.test.ts:24`、`engine/selectivity-round.test.ts:520`、`model/driver-scenario.test.ts:33`、`model/selectivity-scenario.test.ts:33`、`model/caps.test.ts:35`（内联签名） | 6 | 部分 |
| **合计** | | **17** | |

**另外三处是行为而不是改动，要在规格里先想清楚**：
`driver-scenario.test.ts`、`selectivity-scenario.test.ts`、`selectivity-round.test.ts`
各有一个**代号两两配对**的循环，4×4 变 5×5，于是会**新跑出 9 对代号组合**；
`driver-scenario.test.ts:103` 的 `GENERATIONS.length² × TAMPER_KINDS.length` 是自算的，不会红，
但那 9 对新组合里任何一对的拒绝裁定不如预期就会红。
**这三处是这一刀真正的风险所在，而不是那 17 处机械改动。**

**结论：它是一刀，而且是 Wi-Fi 8 唯一的一刀。** 它不是 W10 那种结构改造：
十七处里十三处由 `tsc` 点名，零重标定，新档位只被主动声明 `'uhr'` 的场景看见。

### 2.6 **一处会悄悄撒谎的地方，必须在第一门 11bn 课之前修**

`src/course/curriculum.ts` 的 `citedBases` 有四个探针，**没有一个是 11bn**，
而探针顺序让 `802.11bn` 落进最后那个 `/802\.11/`。实测（`probes.local/basisprobe.ts`）：

```
"本课的数出自 P802.11bn 草案：SFD r19（11-24/0209r19）。"
  citedBases = ["ieee-802-11"]        ← 已发布标准
  citedDocs  = ["11-24/0209r19"]
"仅文稿号：11-24/0209r19。"
  citedBases = []
  citedDocs  = ["11-24/0209r19"]
```

**后果是读者可见的**：`citedBases` 返回 `ieee-802-11` ⇒ `teachesDraft` 为假 ⇒
`CoursePanel.tsx:281` 那条依据行不是琥珀色、`:440` 那个「草案，内容可能变动」不出现。
**一个读自 2026 年框架文稿的数，会被告知它来自一部已批准的标准。**
这正是 `tests/course/basis.test.ts` 立起来要防的那件事，**而它防不住这一件**：
那份文件里已经有一条 `it('does not read 802.11 out of 802.11bp')`（`basis.test.ts:173`），
**同一条对 `bn` 写出来今天就是红的。**

**另外两件实测，决定了这个修法能不能单独成刀：**

- `BASES` 多一个没人声明的条目——**不红**（`basis.test.ts:69` 的 `names every basis any tier or module declares` 只查「声明的都存在」，不查反向）。
- `CONTRIBUTIONS` 多一个没课引用的条目——**红**
  （`basis.test.ts:148` 的 `registers no contribution the course has stopped using`）。
  而 `citedDocs` 的正则 `/1[15]-2\d\/\d{4}r\d+/g` **已经**能抓到 `11-24/0209r19`，
  于是 `basis.test.ts:143` 的 `cites only registered contributions` 会要求它进注册表。

**所以这个修法劈成两半**：探针 + `BASES['p802-11bn']` + 那条取反的单元测试
可以**单独落地、零读者可见**；而 `CONTRIBUTIONS` 的 SFD 条目与 `TIERS[3].basis` 的新成员
**必须和第一门课同一个提交**。
形状和 link-2g 那一刀的发现一样（「插入的那条 `MODULES` 条目和那门课必须在同一个提交里」）。

**文稿编号的写法，照既有做法。** `CONTRIBUTIONS` 里 TGbp 的框架文件记作
`'11-24/1613r20': 'TGbp 规范框架'`，所以 TGbn 的 SFD 记作 `11-24/0209r19`，一句话写「TGbn 规范框架」。
Mentor 的 `11-24-0209-19` 折成 `11-YY/NNNNrR`，和 UWB 侧的 `15-YY/NNNNrR` 同一套。

### 2.7 这一问的答案，一句话

**它是一门关于引擎行为的课，而那个行为要先建，建法是新开一个代号。**
**它过 W5 的闸门**——两条判据各有实测支撑，结构闸门有场景、有跑、有记录。
**而「关于草案本身」的那条路在这个仓库里不存在**，UWB 第三阶段那九门课不是先例，
它们是「先建再教」的九个例子。

---

## 3. 两条「已交付、交在别处」的搬家

### 3.1 代价实测：**0 处代码，0 处读者可见**

brief 说「移动是读者可见的结构改动（阶段标签、模块归属、`trackOf`）」。**这个前提不成立。**
逐项查过：

| 查什么 | 命令 | 结果 |
| --- | --- | --- |
| 这两条有没有对应的课 id | 两条都是 `2026-09-18-...-design.md:113-120` 的要点行 | **没有** |
| 有没有对应的 `MODULES` 条目 | `MODULES.filter(m => m.tier === 3)` | **零个** |
| 有没有对应的 `TIERS` 条目 | `TIERS[3]` 是整个阶段，不是某一条 | **没有** |
| `trackOf` 会不会动 | `trackOf(l) = MODULES[l.module].track ?? TIERS[MODULES[l.module].tier].track` | **不会**：它读的是课的 `module`，而没有课要改 `module` |

**真正交付它们的那些课已经在搬家要去的地方了**：
`@bianchi` #22、`@bianchi-vs-sim` #23、`@rate-vs-model` #24 在 M5 / tier 0；
UWB 第三阶段那九门在 M27–M30 / tier 6。**搬家搬的是两份文档里的记账，不搬任何一门课。**

brief 引的那个代价（`TIERS`／`module` 索引／38 文件 58 处）属于**插一个模块**，
那是 §6 的 W12 的代价，不是这里的。**而 38 / 58 这个数本身是对的**，见 §6.0。

### 3.2 唯一会红的一处，以及怎么不红

`tests/course/wifi-coverage.test.ts:684-705` 的 `CENSUS`（`:692` 是那一行）把覆盖表**每一张表的表头**钉住，
并注明谁核它的数。§15 的两张表都登记为「prose cells, no figures」：

```
[['Tier 4 原定的条目', '状态'], '§15 — prose cells, no figures'],
```

**所以改写那两格状态是免费的**；而**往那份文档里新加一张表会红**，
除非同一刀在 `CENSUS` 里补一行。**改状态格，不要加表。**

### 3.3 怎么写，因为「已交付」略重了一点

**没有任何一门 UWB 课的「题目」是工作组过程。** 存在的是机制课里的出处纪律
（§2.2 举了 `@uwb-ssbd` 的被否决意见与 `@uwb-subrounds` 的被撤回意见）
加上 `BASES.draft`、琥珀色依据行、`draftMark` 与 22 条 `CONTRIBUTIONS`。
**那确实就是在教这件事，但要用这些词写，而不是声称有一门不存在的课。**

建议的两格文字（给下一刀抄，本刀不改那份文档）：

- 「🔧 Validating a simulator against analytic models, ns-3 and measurements」：
  **已交付一半，交在第一阶段**（`@bianchi` #22、`@bianchi-vs-sim` #23、`@rate-vs-model` #24，M5 / tier 0）。
  ns-3 与实测两侧没有，且不在第四阶段的排期里（它们不是课的代价，是两个外部依赖）。
- 「➕ Reading the standard and the task-group process」：
  **已交付，交在 UWB 轨名下，形式是九门机制课的出处纪律加两张注册表**，不是一门以它为题的课。
  Wi-Fi 侧 802.11-2024 没有工作组过程可读；**而 11bn 有**，于是这一条在 Wi-Fi 侧的续篇
  不是「读过程」，是 §2.4 那门课的出处一节与 §6 的 W13。

### 3.4 顺手记一条数字更正，给下一刀

§15 与 backlog 都写「TGbn 语料库有 2761 份文稿」。**2 761 是文件数**：
`text/*.json` 2 761、`toc/*.json` 2 761。而 `catalog.json` 的 `n_documents` = **2 767**、
`n_with_text` = **2 760**（README 同）。
**所以「2761 份文稿」把文件数当成了文稿数，两头各差六与一。**
`text/` 比 `n_with_text` 多出的那一个文件没去追，它不影响任何结论。
**本刀不改那两份文档**（口径是只写这一份规格），记在这里好让下一刀顺手核掉。

---

## 4. 三门方法课：不需引擎，但闸门怎么算

### 4.1 闸门对它们的含义，一句话

**判据 1 对它们无从下手**（它问的是「一个特性做完之后」，而方法课不加特性），
**而第二层的结构闸门照样全套适用，并且它是能过的**：
`scenario` 必填 ⇒ 可以复用既有场景；
`watch` 必须在前三块之内 ⇒ 一篇散文过不去；
每个 `jumps[]` 必须在基准跑里找得到 ⇒ **它必须点出一条真实存在的记录**。

**所以含义是：可以不加引擎，但不可以不跑，也不可以指一条不存在的记录。**

### 4.2 「实验设计与统计」——**大半已经交付，剩下的那一半是半门课**

读过 `@bianchi-vs-sim`（#23）、`@fading`、`@edca-tamper`、`@tier1-project-review`（#26）之后：

| 这门课想教的 | 已经在哪 | 原话 |
| --- | --- | --- |
| 把一次比较写成方法 | `@bianchi-vs-sim` outcome 1 | 「把一次比较写成方法：哪一次跑、数哪些记录、模型的输入从哪里来」 |
| 核对估计量是不是模型定义的那个量 | `@bianchi-vs-sim` outcome 2；`@tier1-project-review` outcome 2 | 「把你心里那个量，和屏幕真正在数的那个量区分开」 |
| 残差要如实报，不许调常数 | `@bianchi-vs-sim` outcome 3 | 「而不是调一个常数直到两条曲线重合」 |
| 确定性仿真器没有置信区间 | `@bianchi-vs-sim` 的 `limits` | 「引擎是确定的……所以这里没有置信区间可言：换成种子 8 或 12345 会得到 25.53% 与 25.71%。可复现不等于精确」 |
| 跨种子复现 | `@fading`（7/11/23/101/999 五个种子一张表）、`@edca-tamper`（五个种子，**而它的测验答案就是「一个种子排出来的次序是巧合」**） | `@edca-tamper` 的测验解释：「换四个种子再跑，最后三种的相互次序就翻过来了」 |

**真正剩下的只有一件：扫描本身的设计——几个种子、怎么选、在一个确定性仿真器上能下什么结论。**
而它的操作面已经存在：`src/editor/FloorPlanEditor.tsx:518-521` 把 `seed` 做成了一个数字输入框，
所以一条 `tryThis` 可以正当地说「把种子改成 11、23、101，各跑一次，记下三个数」，读者做得到。

**裁定：立案，建议不批作为独立一门课**（理由与形状照 W2／W4／W6／W7／W8b／W10 那六条）。
一门课的 2 000–3 000 字里有四分之三会是上面那张表的重述，
而「新小节更正了、旧小节还在重述」是这个仓库反复抓到的缺陷。
**建议改成把缺的那半句加进 `@bianchi-vs-sim`**：它今天 2 042 字，
逐课上界 4 400（严格），**还能加 2 357 字**，而要加的是一两百字。
它已经有「跨种子」那一条 `limits`，加的是扫描设计那一层，**挂在既有论证下面而不是另起一门**。
**什么时候重新考虑这一条、而且可检验：当 `@bianchi-vs-sim` 的主路径已经容不下它的时候**
（今天离上界 2 357 字，不成立）。

### 4.3 「从问题到贡献」——**这一条该做，而且它是唯一没有重叠的那条**

它和既有任何一门都不重叠，而它的素材现在就在本机，且**全是公开记录**：
`tables/d1_clauses_from_lb291.md`（LB291 的 8 523 条意见 / 618 个条款）、
`tables/d2_clauses_from_lb296.md`（LB296 的 7 874 条 / 712 个条款）、
1 682 份提案、763 份意见决议文稿、SFD r19 自己那 143 个 `TBD`。

一门课可以把**一个真实的想法**从提案 → 动议 → SFD 的一行 → 意见 → 决议走一遍，
只引条号、字段名、数值与文稿编号。
**而它的场景与跳转必须有来处**，诚实的答案是：**它骑 §2.4 那门课的场景**——
读者先量到「阶梯粗了多少」，再去看工作组对这件事的处理留下了什么记录。
**所以它排在 Wi-Fi 8 之后，不能在前。**

### 4.4 「结业项目」——**建议不批，它是四门项目课的重复**

今天已经有四门项目课，而它们的 `outcomes` 已经覆盖了一个研究项目会问的全部四件：

| 课 | 它已经要求的 |
| --- | --- |
| `@tier1-project` #25 | 先预测再看结果；「把四个预测写成别人能拿去批改的样子」 |
| `@tier1-project-review` #26 | 并排比对、点名一个机制并用模型自己的单位定量、如实报出剩余 |
| `@capstone` #54 | 三个候选改动的代价与收益；**说出你会否决哪个，以及是哪一个测量让你否决它**；交出写明「它没有测什么」的报告 |
| `@uwb-capstone` #88 | 自己做三个设计决定，并**用日志为自己的选择辩护** |

**一门再问同样四件的第五门项目课是重复。** 唯一它能问而上面四门问不出的，是
「把一个草案机制实现出来、评估它、写出来」——**而那件事依赖 §2.5 的引擎工作，
并且它更像一次真实的刀而不是一门课。**

**裁定：立案，建议不批。**
**什么时候重新考虑、而且可检验：当 `'uhr'` 落地、读者手里有一个草案机制可以改的时候**（§6 的 W12 之后）。

---

## 5. 五处会先红的，逐个重量

全部由 §9 的脚本量出，并且和断言逐条对过。基线六条断言今天全绿
（`npx vitest run tests/course/readability.test.ts tests/course/readability-rules.test.ts
tests/course/lessons.test.ts tests/course/basis.test.ts tests/course/wifi-coverage.test.ts
tests/course/limits.test.ts` → 6 files / **1 981 passed**）。

### 5.1 课数与模块数——精确断言，加课加模块必然红（那是设计意图）

| 断言 | 位置 | 今天 |
| --- | --- | --- |
| 课数 `toBe(88)` | `readability.test.ts:1152` | 88 |
| 课数 `toBe(88)` | `readability-rules.test.ts:289`（**brief 漏了这一处**） | 88 |
| 模块数 `toBe(31)` | `readability.test.ts:1154` | 31 |
| `MODULES.map(m => m.tier)` 字面量数组 | `lessons.test.ts:304-311` | 31 项，`[0×7, 1×5, 2, 4×4, 5×10, 6×4]` |
| `MODULES.map(m => m.title)` 字面量数组 | `lessons.test.ts:312-322` | 31 项 |
| 分组头的出现次序 ≡ `MODULES` 下标次序 | `lessons.test.ts:624` | 绿 |
| 每个模块至少一门课 | `lessons.test.ts:325-328` | 绿（**所以模块与它的第一门课必须同一个提交**） |
| 层 4 逐课八列条目数表 | `readability-rules.test.ts:629-718` 的 `ITEMS`（88 行），加 `:720` 的双向等式与 `:732` 的逐格比对 | 88 行 × 8 列 |

**加一门课 + 一个模块要显式编辑的是：以上七处，加 `ITEMS` 一行八列。**

### 5.2 逐课主路径 `(700, 4 400)`，两端都严格

实测：最紧的是 `@ru-diversity` **4 030**，**距上沿 370，还能加的字是 369**；
下沿最近的是 `@relay-hops` **1 081**。
全课程 88 门主路径合计 **193 882**，均值 **2 203.2**。
**一门新课的 2 000–3 000 字落在这个区间的中间三分之一**，不紧。

### 5.3 `limits` 债务棘轮——**新课必须贡献 0 笔**

实测 `debt = 292`、`ceiling = 292`、`slack = 0`。
**而「0 笔」不是指望，是有先例的，且先例是量出来的**：

| 课 | 它欠的笔数 |
| --- | --- |
| `@link-2g`（W3，2026-10-08） | **0** |
| `@amp-backscatter`（W5，2026-10-05） | **0** |
| `@wan-rtt` | **0** |
| `@uwb-ancillary-request` | **0** |
| `@uwb-sp3` | 5（**它早于 296 → 292 那次收紧**，不是反例） |

**操作上要做到的事，说清**：这门课在任何 `limits[].text` 里点到的每一个 `ZH_TERMS` 词条，
都必须**也**在这门课自己的受评主路径上被点到（导出 `owed`：
`names(field, t) && !names(zhMainText(l), t)`）。
**抬那个上限要人批，而本案默认不抬**，它进 §7。

### 5.4 分钟数合计 `toBe(1_875)`——等式，而最紧的一门只剩一个字

它是等式（`readability.test.ts:1222`），**通过集合只有一个点**，所以余量恒为 0，
加课必然要在课文定稿之后重新量一遍并显式改这个数。

实测每课到下一个五分钟档的字数余量（`(5·(k+0.5) − raw) × 220`，`k = round(raw/5)`），最紧的八门：

| 课 | raw 分钟 | 到下一档还剩 |
| --- | --- | --- |
| `@rate` | 22.50 | **1 字** |
| `@uwb-reply-time` | 27.48 | 4 字 |
| `@uwb-m2m` | 27.48 | 5 字 |
| `@ofdma-ul` | 22.46 | 9 字 |
| `@rts-cts` | 12.45 | 11 字 |
| **`@edca`** | **17.43** | **16 字** |
| `@streams` | 27.39 | 25 字 |
| `@uwb-sensing` | 22.39 | 25 字 |

**覆盖表 §17 那张表列了六行而跳过了 `@edca`**，于是它在 11 字与 25 字之间少了一行。
那张表没有自称完整，`wifi-coverage.test.ts` 的 `CENSUS` 也注明它「NOT pinned row by row」，
所以这**不是一条红**；**但读那张表的人会以为 25 字是第六紧的，而第六紧的是 16 字。**
记在这里，给下一刀顺手补。

raw 过 30 的仍是两门：`@uwb-ancillary` 31.12、`@ru-diversity` 30.32（都取整到 30），即切片 W2。

### 5.5 分节均值 ±10 %——**对一门新课根本不紧，而同一个 `it` 里另一条才紧**

`readability-rules.test.ts:483-535` 是层 2：十四个分节的「每门有它的课的均值」，
写死的均值 ±10 %（`TOLERANCE = 0.1`）。实测今天逐个与写死值一致：

| 分节 | 有它的课数 | 实测均值 | 写死 |
| --- | --- | --- | --- |
| title | 88 | 11.3 | 11 |
| why | 88 | 132.4 | 132 |
| outcomes | 88 | 78.6 | 79 |
| terms | 88 | 88.7 | 89 |
| picture | 88 | 639.8 | 640 |
| numbers | 88 | 726.5 | 726 |
| deeper | 73 | 365.5 | 366 |
| sources | 88 | 203.7 | 204 |
| limits | 86 | 592.2 | 592 |
| observe | 88 | 124.1 | 124 |
| tryThis | 88 | 113.6 | 114 |
| quiz | 88 | 299.6 | 300 |
| variantLabel | 65 | 16.1 | 16 |
| jumpLabel | 88 | 26.1 | 26 |

**顶不顶得住，按 §17 的量法算出来了**：加 k 门课、每门该分节 v 字，
新均值 `(sum + k·v)/(n + k)` 要落在写死值的 ±10 % 内。解出 v 的允许区间：

| 分节 | k = 1 | k = 2 | k = 3 | k = 4 |
| --- | --- | --- | --- | --- |
| title | ≤ **84** | ≤ 48 | ≤ 36 | ≤ **30** |
| variantLabel | ≤ 118 | ≤ 68 | ≤ 51 | ≤ 43 |
| jumpLabel | ≤ 251 | ≤ 140 | ≤ 103 | ≤ 84 |
| outcomes | ≤ 814 | ≤ 451 | ≤ 329 | ≤ 269 |
| why | ≤ 1 276 | ≤ 711 | ≤ 522 | ≤ 428 |
| limits | ≤ 5 727 | ≤ 3 189 | ≤ 2 343 | ≤ 1 920 |
| numbers | ≤ 7 146 | ≤ 3 973 | ≤ 2 915 | ≤ 2 386 |

（下界在 k ≤ 4 时全部为负数，也就是不约束。）
**最紧的那一格是 `title`：四门新课各自的标题要短于 30 个汉字，而全课程均值是 11.3。**
**所以结论是：一门（甚至四门）正常形状的新课动不了这十四个均值中的任何一个。**
这一层红了意味着别的事（一次横扫全课程的编辑），而那时不该放宽它——它自己的注释就这么说。

**而真正紧的一条，brief 没点到，在同一个 `it` 的末尾（`:533-534`）：**

```ts
expect(all.length).toBeGreaterThan(9000)
expect(all.length).toBeLessThan(11500)
```

`all` 是全课程读者读到的字符串条数。实测今天 **10 529** 条，每门均值 **119.6** 条。
上界严格 ⇒ 还剩 **970** 条 ⇒ **8.11 门平均大小的课。**
**这是「第四阶段最多能装多少」今天唯一一条真正的硬顶，而抬它要人批**（进 §7）。

---

## 6. 做不做，先做哪一件

**做。开它，一个模块，两门课，最多。** 并且有一件必须先做。

### 6.0 一条结构性的理由，决定了「一个模块」而不是四个

一个 `tier: 3` 的模块要插在**下标 13**（`@link-2g` 的 M12 之后、UWB 的 M13 之前），
不能追加在末尾。理由是 link-2g 那份规格已经论证过并被用户采纳的那一条：
`COURSE_ORDER` 的次序**就是**「下一课」按钮（`CoursePanel.tsx:426-427`、`lessons.ts`），
追加在末尾会让读者在 `@uwb-capstone`（UWB 轨最后一门）按「下一课」掉进一门 Wi-Fi 课。
**那次「追加而不是插入」被否掉就是这个理由，核过，成立。**

**插在下标 13 的代价，今天重量过，和 W3 那一刀一样是 38 文件 / 58 处。**

> **这个数的依据是 W3 的实现报告，不是它的规格。**
> `.superpowers/sdd/w3-report.md:175-179` 原话：「索引迁移是 38 个文件 58 处，不是规格算的 35 / 55。
> 规格用 `grep "module: 1[0-9]\|module: 2[0-9]"` 清点，漏了三个测试文件里写死的 `.module).toBe(…)`（**不带冒号**）……
> **漏掉任何一处都会红**，所以这是规格的一处错而不是口径差异。」
> 所以本文第一版引 `2026-10-08-link-2g-design.md:348` 那张表的 35 / 55 **是错的**：
> **规格是立案时的最好猜测，实现报告是落地后的测量；冲突时后者赢。**
> 今天已重测确认：`grep -rn "\.module)\.toBe(" tests/` 共 **17** 处，
> 其中「相对写法」（`toBe(backoff.module)` 这一类）**不用动**，
> 写死的有七处（module 7 / 8 / 11 / 12 / 14 / 14 / 28），
> **而落在 13 以上、因此要跟着移的正好是那三处**：
> `uwb-deferred-ds.test.ts:46`（14 → 15）、`uwb-reply-time.test.ts:55`（14 → 15）、
> `uwb-ssbd.test.ts:91`（28 → 29）。其余四处（7 / 8 / 11 / 12）都在 13 以下，不动。

| 改什么 | 文件数 | 处数 | 量法 |
| --- | --- | --- | --- |
| `src/course/uwb/*.ts` 的 `module:` 13…30 → 14…31 | **33** | **33** | `grep -rn "module: " src/course/uwb/ \| wc -l` = 33 |
| `curriculum.ts`：插入一条 `MODULES` 条目 | 1 | 1 | — |
| `curriculum.ts`：分组头 `// M13…M30` → `M14…M31` | （同上） | **18** | `grep -c "^  // M1[3-9] · \|^  // M2[0-9] · \|^  // M30 · " src/course/curriculum.ts` = 18 |
| `curriculum.ts`：新分组头 + 课 id | （同上） | 1 | — |
| `tests/course/lessons.test.ts:304,312` 两条字面量数组 | 1 | 2 | — |
| **三处写死的 `.module).toBe(…)`（14、14、28 → 15、15、29）** | **3** | **3** | `grep -rn "\.module)\.toBe(" tests/` 共 17 处，落在 13 以上的写死值正好这三处 |
| **合计** | **38** | **58** | |

**而这笔钱每插一个模块就要再付一次**（33 处 UWB `module` 字段每次都跟着移）。
**所以第四阶段取一个模块，课加在它底下**——第二门课的索引代价是 **0 处**。
一个阶段一个模块，第三阶段已经立过这个先例，`curriculum.ts:95-104` 的注释写明了它是设计。

### 6.1 顺序与代价

| 切片 | 内容 | 汉字 | 索引代价 | 读者可见 | 建议 |
| --- | --- | --- | --- | --- | --- |
| **W11** | **出处探针**：`BASES['p802-11bn']`（`draft: true`）、`citedBases` 的 11bn 探针**排在 `ieee-802-11` 之前**、`basis.test.ts` 补一条 `does not read 802.11 out of 802.11bn` | **0** | 0 | **无**（没有课声明它） | **批，排第一** |
| **W12** | **Wi-Fi 8 的细速率阶梯**：`'uhr'` 代号 + 四个新档 + 第四阶段第一个模块 + 第一门课 + `CONTRIBUTIONS` 的 `11-24/0209r19` + `TIERS[3].basis += 'p802-11bn'` | 估 **+2 400 ± 400**（对照 `@link-2g` 2 496、`@mcs-ladder` 1 282、`@rate-fallback` 1 708） | **58 处 / 38 文件** | **有**（阶段第一次可见 + 琥珀色草案行）→ §7 | **批，排第二** |
| **W13** | **从问题到贡献**：同一个模块的第二门课，骑 W12 的场景，把一个想法从提案走到决议 | 估 **+2 400 ± 400** | **0** | 有（模块下多一门课） | **批，排第三**；不可早于 W12 |
| **W14** | 实验设计与统计，独立成课 | — | — | — | **立案，建议不批**：四分之三已交付，建议把缺的那半句加进 `@bianchi-vs-sim`（还能加 2 357 字）。重新考虑的条件在 §4.2 |
| **W15** | 第四阶段项目课 | — | — | — | **立案，建议不批**：四门项目课的重复。重新考虑的条件在 §4.4 |

**W11 为什么能单独落地、又为什么必须单独落地**：
单独落地得通，因为没人声明的 `BASES` 条目不红（§2.6 实测）；
必须单独，因为它一旦和 W12 合并，那条「它防不住 `bn`」的事实就会被一刀同时制造和掩盖，
而这个仓库反复出的事故正是「新小节更正了、旧小节还在重述」。
**W11 之后、W12 之前，仓库里存在一条红不了的保证**，这是它全部的价值。

**三件 W12 必须在规格里正面答、本案不替它答的：**

1. 四个新档挂在哪：新 `PhyMode 'uhr'`（本案的建议），还是别的形状。
   **「追加进 `eht`」要在那份规格里被显式拒掉，理由照 §2.5 的那段引文。**
2. 1 dB 宽的窗口怎么摆场景：定点（特意的位置，`limits` 要说）还是开起伏（SNR 游走，更像样）。
   **按 W3 的纪律，这要在立案时先跑一遍，上面 §2.4 的窗口表是推导不是实跑结论。**
3. `selectivity` / `driver` / `selectivity-round` 三处两两配对循环新出的 **9 对代号组合**，
   各自的拒绝裁定应当是什么。**那是这一刀真正的风险，不是那 17 处机械改动。**

### 6.2 开了之后它是什么形状，说清免得读者以为是缺口

**第四阶段将有一个模块、两门课，而那是设计不是积压。**
这句话要像第三阶段那样写进 `curriculum.ts` 那一行上方的注释，并引本节：
六条原定里两条已交付在别处（§3）、一条建议并入既有课（§4.2）、
一条建议不批（§4.4）、剩下的两条就是 W12 与 W13。

---

## 7. 等用户定

**三件，都不替他决定。**

1. **`TIERS[3].basis` 加 `p802-11bn`，以及第四阶段第一次对读者可见。**
   后果是面板上多一个阶段标签，并带一条**琥珀色**的依据行
   （`CoursePanel.tsx:281`：`tier.basis.some(b => BASES[b].draft)`）
   与课内的「草案，内容可能变动」（`:440`）。
   顺带一问：`basis.test.ts:74` 那条 `it` 的标题是「marks the **two** unratified drafts」，
   加第三份草案之后那个标题要改（断言本身按键名写，不会红，**但标题会变成一句假话**）。
2. **`all.length < 11500` 这条上界要不要抬。** 实测 10 529，还剩 970 条 ≈ **8.11 门课**。
   W12 + W13 两门用掉约 240 条，**不抬也够**；但这是第四阶段真正的硬顶，该让他知道数。
3. **`limits` 债务棘轮 292 不抬。** 本案的立场是新课贡献 0 笔（§5.3，两个先例实测为 0）。
   **如果 W12 的课文写出来之后做不到 0**，那是要人批的时刻，**而本案默认不批**。

**不需要他拍板的**：新依赖——**本案一个都不加**（`vite-node` 已在 `node_modules/.bin` 里，
语料库在本机只读）。

---

## 8. 本案自己的三条保留

1. **§2.4 那张窗口表是推导，不是实跑结论。** 灵敏度与 N_DBPS 都是实测与公开文档对过的，
   但「一个真实场景里吞吐差多少」没有跑——**跑不了，因为 `'uhr'` 还不存在**。
   按 W3 的纪律这要在 W12 立案时先跑；本案把这一条明写出来而不是把推导冒充成测量。
2. **1 dB 宽的窗口是这门课最弱的一环。** 四个新档里三个只占 1 dB，
   只有 MCS20 占 3 dB（×1.111）。如果 W12 跑出来的差小到读者读不出，**这门课就该退回这张表**，
   而退回的理由要写在这里的原处。
3. **「从问题到贡献」骑别人的场景，这件事全课程没有先例。** 每一门课今天都有自己的
   `scenario()`（可以是同一个构造器的另一个取值，如 `@uwb-nba-coexist` 复用 `uwbNbaScenario`）。
   W13 照那个形状做得到，但它的 `jumps` 要指向 W12 场景里真实存在的记录，
   **这一条在 W13 的规格里要先跑过再写。**

---

## 9. 重跑这份文件里的每一个数

探针放在 worktree 的 `probes.local/`（`*.local` 已 gitignore），**本刀收工时已删除**。
下面四段是它们的内容要点，重建一遍即可；全部从 worktree 根目录跑。

```bash
# 口径与结构：课数、模块数、分钟合计、主路径字数、逐阶段模块/课数、分轨课数、
# 分节均值、每课到下一个五分钟档的余量、raw > 30 的课、全课程字符串条数
#   读 LESSONS / COURSE_ORDER / MODULES / TIERS / lessonMinutes / lessonChars
#   / lessonTexts / zhChars / SECTIONS
npx vite-node probes.local/census.ts

# 棘轮：debt / ceiling / slack，以及指定几门课各欠多少笔
#   读导出 limitsRatchet / LIMITS_DEBT_CEILING / MAIN_PATH_BAND
#   （2026-10-10 起在 tests/course/coverageNumbers.ts；在那一刀之前它们在 tests/course/limitsDebt.ts）
npx vite-node probes.local/ratchet.ts

# ±10 % 还容得下多少：对每个分节解出「加 k 门课、每门该分节 v 字」的 v 允许区间；
# 以及 all.length 到 11500 的余量换成几门课
npx vite-node probes.local/headroom.ts

# 速率阶梯：今天十四档的所需 SINR 与档间步长、四个新档插进去之后的全表、
# 每个新档占的窗口与它顶掉的档、SFD 既有行与引擎 sensDbm 的逐行比对、
# ndbps = 234 x bits x 码率 的逐档验算
#   注意 STANDARD_NF_DB = 10 是 src/engine/phy.ts:54 的模块私有常量，探针里写 noiseDbm(20, 10)
npx vite-node probes.local/ladder2.ts

# citedBases 会把 802.11bn 读成什么
npx vite-node probes.local/basisprobe.ts

# 基线六条断言
npx vitest run tests/course/readability.test.ts tests/course/readability-rules.test.ts \
  tests/course/lessons.test.ts tests/course/basis.test.ts \
  tests/course/wifi-coverage.test.ts tests/course/limits.test.ts

# 结构计数
find tests -name '*.test.ts' | wc -l                                   # 270
grep -rn "module: " src/course/uwb/ | wc -l                            # 33
grep -c "^  // M1[3-9] · \|^  // M2[0-9] · \|^  // M30 · " src/course/curriculum.ts   # 18
```

语料库一侧（`D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/wifi8_tgbn/`，
只读，一个字也没抄进本仓库）：

```bash
ls text/*.json | wc -l                 # 2761
ls toc/*.json  | wc -l                 # 2761
node -e "const j=require('./catalog.json'); console.log(j.n_documents, j.n_with_text)"   # 2767 2760
node -e "const j=require('./catalog.json'); for(const [k,v] of Object.entries(j.topics)) console.log(k,v)"
# SFD 的 TBD 逐小节计数：按 ^## / ^### 切段，每段数 \bTBD\b；合计 143
# 新 MCS 的灵敏度表：tables/sfd_full.md 的 "Receiver Minimum Input sensitivity for new MCSs"
#   （Motion #417），必选四档见 Motion #216
grep -n "Minimum sensitivity\|Mandatory support MCSs" tables/sfd_full.md
```
