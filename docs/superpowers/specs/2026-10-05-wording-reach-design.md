# 切片 4g：措辞规则靠「字段名表」取课文，而漏网的是这个形状本身

2026-10-05。基线提交 `d235431`，量数期间本分支另一刀落地成 `6dc8c97`
（本 worktree `.claude/worktrees/feat-link-2g`，分支 `feat/uwb-ranging`）。
`6dc8c97` 只碰 `src/player/player.ts`、`src/ui/App.tsx`、`src/ui/store.ts`、
`tests/ui/store-course.test.ts`（`git show --stat 6dc8c97`），**`src/course/` 与
`tests/course/` 一行未动**，所以这份规格里的每个数在两个提交上都一样。
这份规格不动引擎、不动场景、不动任何数字、不动 `tests/fixtures/`——它只动**取课文的那只手**：
一条措辞规则看得见课程里的哪些字，以及这件事今天由什么决定（答案：由十二处各写一遍的字段名表决定）。

**结论五句话：**

1. **不是两张表，是十二处手搭的字段名表，取课文的那十处各取到不同的一套字段。**
   `lessonStrings`（`src/course/readability.ts:131`）和 `mainPathChars`（同文件 `:165`）
   各有一个手搭对象；测试里另有十处取「读者看得见的文本」，其中九处是在 `lessonStrings`
   后面再手加若干字段，第十处（口径表）另搭了一整套走法。
   **读者文本在这个仓库里一共被取成 7 种互不相同的字段组合**（§1.1）。
   brief 说的「两张表」是这十二处里的两处。
2. **两张表漏的不是同一组——这是 brief 最要紧的一处事实错误。**
   **禁词表（`tests/course/wording.test.ts:46-53`）四处一个不漏**，它自己手加了
   `title`、`limits[].text`、两种 `label`；**自称日期那条规则也一样不漏**
   （`readability.test.ts:452-457`）。**真正漏的只有口径表**
   （`ZH_TERMS` 的加括号规则，走 `readability.test.ts:184-189` 的 `zhMainTexts`），
   而它漏的不是四处，是**七处**：四处之外还有 `terms[].plain`、`deeper`、`sources`。
3. **「今天就已经违规的」逐表分开数：禁词表 0 处、自称日期 0 处、口径表 317 处。**
   而 317 处里 **292 处在 `limits`**——比口径表**故意**排除的 `sources`（180）与
   `deeper`（81）**之和还多 31 处**。所以这不是「网漏了」，这是**课程内容的一笔账**，
   不是这一刀能还的（棘轮钉 **289**，和 292 是两个不同的判据，§3.4 分别命名）。
4. **这一刀的活是 6 处，由两条规则、两个臂判出来**（§3.6.8），
   而决定分臂的是**渲染位置**，不是字段名也不是补救代价：
   **`title` 是这四处里唯一会被印在它自己那门课之外的字符串**
   （`CoursePanel.tsx:312` 目录 83 门全列、`:436` 别课的 `needs` 按钮、
   `:581`/`:586` 别课 `limits` 旁的 `limitUntil`/`limitSeeAlso`），
   而另三处**一个跨课渲染点都没有**。
   更硬的是：**16 条 `until`/`seeAlso` 边 16/16 指向后面的课**（delta 中位 +13、最大 +38），
   所以**一门课的标题会被印在它自己的前置课都还没满足的地方**——
   `radio-primer`(#1) 的 `limits` 旁印着 `fading`(#39) 的标题，而 `fading` 自己的
   21 门前置课读者一门都还没读。
   于是：**臂一（`title`，本课主路径）1 处**（`ofdma-dl | 下行`）；
   **臂二（`variantLabel` / `jumpLabel` / `terms[].plain`，本课或 `needs` 传递闭包）5 处**。
   最硬的两处：`ofdma-dl` 的**标题**里写着「下行」而主路径中文缩写都没有；
   `radio-primer` 的按钮上写着「确认帧」而它是课程第一门、`needs` 为空、闭包 0。
5. **推荐 (c)：结构遍历 + 标签选择器。** 遍历不回答「哪些字符串是中文课文」，
   它只保证**一个字段都不漏**；而「要哪一类」由每条规则自己按标签说。
   新字段**默认进网**（排除表，不是包含表），并且**不分类就抛**——在 83 门课上当场红，
   不是编译期红（`npm test` 是 `vitest run`，**不跑 `tsc`**，§5.2）。
   **分钟数一个都不改**，并且把 1740 与 179 215 两个数钉下来（§6）。

§1 现状十二处 · §2 这四处有多少字 · §3 今天已违规的，逐表分数（§3.5 `terms[].plain` 的处置 ·
§3.6 牙：两条规则两臂 6 处，以及 jump label 为什么没有目的地）· §4 设计的核心问题
· §5 新字段怎么当场变红 · §6 分钟数 · §7 三条路 · §8 推荐与落地顺序 · §9 要改的文件与测试
· §10 fixture · §11 允许但空转 · §12 明确不做 · §13 判断 · §14 对 brief 的更正
· §15 每个数怎么重跑

---

## §1 现状：十二处手搭的字段名表

### §1.1 逐处（行号核过）

| # | 位置 | 它取什么 | `title` | `limits[].text` | `variants[].label` | `jumps[].label` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/course/readability.ts:131` `lessonStrings` | 手搭对象 `:143-146` | ✗ | ✗ | ✗ | ✗ |
| 2 | `src/course/readability.ts:165` `mainPathChars` | 手搭对象 `:166-169` | ✗ | ✗ | ✗ | ✗ |
| 3 | `tests/course/readability.test.ts:184-189` `zhMainTexts`（**口径表**） | 另搭一套，走 `paragraphTexts`/`cellTexts` | ✗ | ✗ | ✗ | ✗ |
| 4 | `tests/course/readability.test.ts:452-457` `readerText`（自称日期） | `lessonStrings` + 手加四处 | ✓ | ✓ | ✓ | ✓ |
| 5 | `tests/course/readability.test.ts:527-530` `everything` | `lessonStrings` + 手加两处 | ✗ | ✓ | ✓ | ✗ |
| 6 | `tests/course/wording.test.ts:46-53` `readerText`（**禁词表**） | `lessonStrings` + 手加四处 | ✓ | ✓ | ✓ | ✓ |
| 7 | `tests/course/kit.ts:164-167`（契约形状套件） | `lessonStrings` + 手加三处 | ✓ | ✗ | ✓ | ✓ |
| 8 | `tests/course/ru-diversity.test.ts:145-149` `text` | `lessonStrings` + 手加四处 | ✓ | ✓ | ✓ | ✓ |
| 9 | `tests/course/selectivity.test.ts:114` `text` | `lessonStrings` + 手加两处 | ✓ | ✓ | ✗ | ✗ |
| 10 | `tests/course/uwb-sensing.test.ts:337` `readerText` | 同上 | ✓ | ✓ | ✗ | ✗ |
| 11 | `tests/course/uwb-sensing-resolution.test.ts:299` `readerText` | 同上 | ✓ | ✓ | ✗ | ✗ |
| 12 | `tests/course/uwb-ssbd.test.ts:402` `everything` | 同上（顺序不同） | ✓ | ✓ | ✗ | ✗ |

取「读者看得见的文本」的是 #3–#12 这十处，它们的字段组合有 **5 种**：
`{四处全有}`（#4 #6 #8）、`{limits + variantLabel}`（#5）、`{title + 两种 label}`（#7）、
`{title + limits}`（#9 #10 #11 #12）、`zhMainTexts` 那一套（#3）。
再加 `lessonStrings` 自己（#1）与 `mainPathChars` 自己（#2）各一种，
**仓库里一共 7 种互不相同的字段组合**。`ru-diversity.test.ts:151` 还有第 8 种
（`mainPathChars` 形状但不含 `body`），它是分段取文本、另有用途，§9.6 说明不动它。

**这张表是这份规格的全部论点**：同一个问题「读者能读到什么」在一个仓库里被回答了七遍，
七个答案互不相同，而没有任何一处测试检查它们是否一致。

### §1.2 四处今天被谁取到：实测，不是读代码读出来的

```
sites NOT in lessonStrings = title 83/83, limits[].text 368/368, variants[].label 115/147, jumps[].label 271/273
sites NOT in zhMainTexts   = title 83/83, limits[].text 368/368, variants[].label 116/147, jumps[].label 271/273
```

读法要小心：这是**按字符串相等**查的。`variants[].label` 有 32 条、`jumps[].label` 有 2 条
恰好与课文里某个表格单元或列表项**字面相同**，所以被算成「在里面」。
**作为 label 被取到的，一条也没有。** `title` 与 `limits[].text` 一条都不重合。

### §1.3 第五处漏网，没人点过名：`terms[].plain`

口径表的 `zhMainTexts`（#3）**完全不含 `terms`**：272 条 `plain` 行、**7 131 个汉字**，
一条也不在它的文本里（实测 `inZhMainTexts=0`）。而 `mainPathChars` **是算它的**。
**7 131 字比 `title`(901) + `variantLabel`(842) + `jumpLabel`(2 147) = 3 890 的总和还多 83%。**
brief 列的四处里最小的三处加起来，不如这一处没被列的。

`terms[].plain` 不进口径表是**对的**，但理由不是「它不是课文」——理由在 §3.5。

### §1.4 `limits` 的结构，以及哪些字段含课文

`Limit`（`src/course/lessonKit.ts:91-128`）有四个键，实测它们在 83 门课上的出现次数与含汉字情况：

| 键 | 出现 | 含汉字 | 是什么 |
| --- | --- | --- | --- |
| `kind` | 368 | **0** | 四值枚举 `threshold` / `unmodelled` / `model-value` / `out-of-scope` |
| `text` | 368 | **368** | **唯一含课文的键**。一到两句话 |
| `until` | 13 | **0** | 一个课程 id（「这一条在《…》里会被解除」） |
| `seeAlso` | 3 | **0** | 一个课程 id（「《…》在这一条上再深一层」） |

`kind` 分布：`unmodelled` 154、`model-value` 101、`out-of-scope` 82、`threshold` 31。
368 条分布在 **81 门课**上；`amp-intro` 与 `amp-ppdu` 的 `limits` 是空数组，
`tests/course/limits.test.ts:33-48` 指名道姓地冻结了这两门（brief 说的「四门 AMP」已经过时：
`amp-slots` 与 `amp-coexist` 2026-10-02 已迁移并带了真限制）。

**`until` / `seeAlso` 只存 id、不存文案**，这是 `lessonKit.ts:117-127` 的注释写明的约定，
而那段注释正是今天仓库里**唯一**提到本规格这个根的地方：

> *`tests/course/wording.test.ts` and `tests/course/readability.test.ts` reach a lesson's
> limits by naming the field (`...l.limits.map((x) => x.text)`) rather than by walking the
> object, so prose in a NEW field would pass under both banned-word lists unseen.*

所以这个根**已经被写下来过一次**，写成了一条「以后谁改这个字段记得同步改两处走法」的口头纪律。
这份规格的立场是：**口头纪律不是网**。

### §1.5 四处都是读者看得见的，逐处核过渲染位置

- `title`：`CoursePanel.tsx:312`（目录行）与 `:413`（课内标题 `{idx + 1} · {lesson.title}`）。
- `variants[].label`：`:490`（变体菜单）。
- `jumps[].label`：`:503-504`（⚡ 按钮）与 `:364`（跳转面板）。
- `limits[].text`：`:563-592`。**关键**：它不是 `<details>`，是**默认展开**的黄边方块，
  排在 `quiz` 之后、`sources`（`:594`，`<details>`）之前。源码注释自己写明
  *Open by default and above `sources`, unlike the provenance*。
  **所以 `limits` 在视觉上是主路径，而在计时上不是**（§6）。
- `terms[].plain`：`:443-459`，一张两列表，**左列是 `terms[].term`（标准自己的拼法）**，
  右列是 `plain`，整块排在 `picture` **之前**。这一点决定 §3.5。

---

## §2 这四处有多少字，多少是「成段的话」

全部按 `zhChars`（`readability.ts:31`，只数 CJK，拉丁字母与数字不计）。

### §2.1 字数

| 处 | 字符串条数 | 汉字数 | 占 `mainPathChars` 总量 |
| --- | --- | --- | --- |
| `title` | 83 | **901** | 0.50 % |
| `variants[].label` | 147 | **842** | 0.47 % |
| `jumps[].label` | 273 | **2 147** | 1.20 % |
| **以上三处合计（chrome）** | 503 | **3 890** | **2.17 %** |
| `limits[].text` | 368 | **47 129** | **26.30 %** |
| **四处合计** | 871 | **51 019** | 28.47 % |

分母是 `mainPathChars` 在 83 门课上的和 = **179 215**。全课程逐字段的汉字数：

```
numbers 59415 · picture 52012 · limits 47129 · deeper 26076 · quiz 24443 · sources 16670
why 10775 · observe 9956 · tryThis 9058 · terms 7131 · outcomes 6425
jumpLabels 2147 · title 901 · variantLabels 842        合计 272 980
```

`mainPathChars` = why + outcomes + terms + picture + numbers + observe + tryThis + quiz
= 10 775 + 6 425 + 7 131 + 52 012 + 59 415 + 9 956 + 9 058 + 24 443 = **179 215**（对上了）。
`lessonStrings` 在全课程返回 **8 999 条字符串 / 221 961 汉字**；221 961 + 51 019 = 272 980（对上了）。

### §2.2 「成段的话」只有一处，另外三处一句都没有

| 处 | 最短 | 中位 | 最长 | ≥30 字 | ≥60 字 |
| --- | --- | --- | --- | --- | --- |
| `limits[].text` | 35 | 118 | 454 | **368 / 368** | 359 / 368 |
| `title` | 2 | 10 | 25 | 0 | 0 |
| `variants[].label` + `jumps[].label` | 0 | 7 | **19** | 0 | 0（≥15 字的有 16 条） |

**所以：83 门课里，在这四处写了成段的话的有 81 门——全部都在 `limits` 里，
而且 `limits` 的每一条都是成段的话（最短 35 字）。**
**`title` 与两种 `label` 里，≥30 字的字符串是 0 条，最长的一条 19 字**
（`uwb-sp3/jumps[0]`：「一轮的第一帧：51 字节的控制消息，它当不了标记」）。
11 条 `variants[].label` 一个汉字也没有（`802.11a`、`MCS 7` 一类）；
`jumps[].label` 273 条全部含汉字。

**这张表把 brief 的「四处」劈成了两类东西**，而后面每一节都要按这个劈法分开说：

- **一处是散文**：`limits[].text`，47 129 字，默认展开，
  比 `deeper`（26 076）与 `sources`（16 670）**之和**（42 746）还长 10 %；
- **三处是 chrome**：503 条短标签，3 890 字，最长 19 字，是目录行、菜单项和按钮上的字。

一条把它们一起纳进来的规则，必然对其中一类是错的。

---

## §3 「今天就已经违规的」：逐表分开数

这是这份规格最关键的一节，而答案**取决于问哪条规则**——所以不能给一个数。

### §3.1 禁词表：**0 处**

`tests/course/wording.test.ts` 的 86 条禁词（`IMAGES` 35 条 + `REGISTER` 51 条），
拿去扫这四处的 871 条字符串、51 019 个汉字：

```
BANS over four sites: hits=0
```

**本来就应该是 0**：`readerText`（`wording.test.ts:46-53`）**自己手加了这四处**，
而 `tests/course/wording.test.ts` 今天是绿的。brief 说「对两张禁词表都是隐身的」，
对这一张是**假的**，而且 `wording.test.ts:33-43` 的 docblock 把这件事写得很清楚：
那次清扫在四处里的三处抓到了真货（`limits` 里的 底噪、一个 jump label 里的
「两个标签挤进同一时隙」、三个不名机理的标题），所以才手加的。

### §3.2 自称日期（`ROTS`）：**0 处**

`readability.test.ts:459-464` 的四条模式，扫同样的 871 条：

```
ROTS over four sites: hits=0
```

同样本来就该是 0：`readability.test.ts:452-457` 也手加了四处，
而 `readability.test.ts:428-432` 的 docblock 正是在解释**为什么必须手加**
（2026-10-04 抓到的三句自称日期全在 `limits` 里）。

### §3.3 口径表：**317 处**，而这个数要分开读

口径表 = `ZH_TERMS`（181 行）的加括号规则，今天跑在 `zhMainTexts` 上，
**基线 0 处失败**（83 门课、979 个术语被实际判过，底线是 450）。
把四处接到 `zhMainTexts` **之后**（读者遇到它们的顺序：`limits` 在 quiz 之后，
label 在页面各处）再跑：

```
ZH_TERMS failures TODAY (baseline walk): 0 lessons, 0 failures
ZH_TERMS NEW failures if four sites join (append) : 317
ZH_TERMS NEW failures if four sites join (prepend): 729
```

逐处归因（一次只接一处）：

逐处归因（一次只接一处），**括号臂与 aka 臂分开报**——合并着报是我第一轮
把 292 和 287 搞混的原因：

| 接哪一处 | 括号臂 | aka 臂 | 合计 |
| --- | --- | --- | --- |
| `limits[].text` | 287 | 5 | **292** |
| `jumps[].label` | 25 | 0 | **25** |
| `variants[].label` | 6 | 0 | **6** |
| `title` | 1 | 0 | **1** |
| 合计（逐处相加） | 319 | 5 | **324** |
| 合计（四处一起接） | 312 | 5 | **317** |

324 与 317 差 7：四处一起接时，同一个术语的首次出现只报一条，几条归因合并了。
**两个数都要写下来，因为落地时看到的是 317。**

**基线 0 处失败这件事本身是一条引理**：它等价于
「凡在本课被判过的主路径上出现过的术语，都已经带了正确的括号」。
所以接进来之后新增的每一条失败，必然是**首次出现就在新接那段文本里**的术语——
即这门课被判过的主路径**从未**写过这个词。
**这条引理把「括号规则会红几条」（判据 P）和「这门课欠了多少个词」（判据 Q）
连了起来，但两者仍然不是同一个数**，因为 P 按失败消息去重、Q 按 `(课, 术语)` 对数。
§3.4 把两个判据分别定义并各量一次。

### §3.4 把 317 放到该放的尺上：它比**故意**排除的两处之和还大

口径表**故意**不读 `deeper` 与 `sources`（`readability.test.ts:170-173`：
*collapsed professional depth — `sources` is where the clause numbers and the English
names already live*）。同一套测法，把这两处接进来：

**两个数，两个不同的判据——这一节把它们分开命名，因为它们很容易被当成同一个数写错了**
（协调者就是在这里抓到我的：我把棘轮写成 279，而 `limits` 占的是 292）：

- **判据 P（「括号规则会红几条」）**：把该字段接进口径表的走法，新增的失败条数。
  一条失败 = 一门课的一个术语，分**括号臂**与 **aka 臂**两种。
- **判据 Q（「这门课欠了多少个词」）**：`(课, 术语)` 对的个数——
  该术语在这个字段里被命名，而在本课**被判过的主路径**上从未被命名。

| 接哪一处 | 判据 P：括号臂 + aka 臂 = 合计 | 判据 Q：`(课,术语)` 对 / 涉及课数 | 今天的待遇 |
| --- | --- | --- | --- |
| `sources` | 176 + 4 = **180** | **189** / 69 | **故意排除** |
| `deeper` | 80 + 1 = **81** | **90** / 39 | **故意排除** |
| 两者之和 | **261** | **279** | — |
| `limits[].text` | 287 + 5 = **292** | **289** / 76 | 被当成「漏网」 |
| （对照）`title` | 1 + 0 = **1** | **1** / 1 | 四处之一 |
| （对照）`variants[].label` | 6 + 0 = **6** | **4** / 3 | 四处之一 |
| （对照）`jumps[].label` | 25 + 0 = **25** | **28** / 16 | 四处之一 |
| （对照）四处一起 | 312 + 5 = **317** | **315** / 76 | — |

> **这张表里有一处是我第一轮量错的，更正写在这里而不是只写在 §14。**
> **`limits` 的判据 Q 是 289，不是我第一轮写的 279。**
> 279 那次，我在比较的两边用了不一致的尺：缩写在「出现在 `limits` 里」那一侧
> 用的是整词边界（`(?<![A-Za-z0-9_])ACK(?![A-Za-z0-9_])`），
> 在「出现在主路径上」那一侧用的是裸 `includes`——于是主路径上任何
> 含 `ACK` 字样的长 token 都替 10 对开脱掉了。
> **换成两侧同一把尺，289。** 而 279 这个数现在归 `sources` + `deeper` 的判据 Q 之和，
> 纯属巧合，所以更要写清楚。**棘轮钉 289。**

**判据 P 下：`limits` 的 292 比 `sources` + `deeper` 的 261 还多 31。**
**判据 Q 下：`limits` 的 289 和两者之和 279 基本持平（多 10）。**
**两把尺都说同一件事**——`limits` 的用词密度不在主路径那一档，在折叠深度那一档。
按这把尺，`limits` 的行为**不像主路径，像折叠的专业深度**——
它和 `sources` 一样，是一个「写给已经懂的人、用词密度远高于课文」的字段。
而它在界面上**默认展开**（§1.5）。

**所以真正的矛盾不在走法里，在课程契约里**：`limits` 被当作主路径渲染，
被当作深度书写，又在计时里被当作深度（§6）。这三件事不可能同时都对。
这份规格不解决那个矛盾——它**把它量出来、钉住、留给下一刀**（§8 第 4 步）。

### §3.5 `terms[].plain`：8 处残余，而括号规则对这个字段**结构上**不适用

`terms` 是一张**两列表**（`CoursePanel.tsx:443-459`）：左列 `terms[].term` 是标准自己的
拼法（`RSSI`、`A-MPDU`、`MCS`），右列 `plain` 是中文解释，整块排在 `picture` **之前**。

把 `plain` 单独按阅读顺序接到最前面，括号规则新增 **154 处**失败。
**这 154 处几乎全是测法造成的**：把中文名从它同一行的英文名旁边撕下来，再判它没有英文名。
把整行（`term` + `plain`）一起接，仍有 **190 处**——更糟，因为 `term` 列给的是
`A-MPDU` 这样的拼法，不是 `（aggregate MPDU, A-MPDU）` 那样的括号，规则认不出来。

**真正的结构性理由，量出来了**：**272 行词表里有 101 行（37 %）的 `plain` 解释里
出现了另一个词表术语**。这是词表的本分——**一条解释必然用到别处定义的词**，
否则它就不是解释而是递归。要求每条 gloss 为它借用的每个词再带一次括号，
是逼出 272 行里塞满括号的词表。**所以括号规则对 `terms[].plain` 不适用，
理由写在纸上，不是「没人注意到」。**

**处置（明确的，不是记在清单里）：**

| 这个字段 | 待遇 | 理由 |
| --- | --- | --- |
| 进禁词表 / 自称日期 | **今天就在**（`lessonStrings` 走 `terms`，只跳 `term` 列） | 子串禁令无序无上下文，§4.1 |
| 进 `mainPathChars` | **今天就在**（7 131 汉字） | 它在 `picture` 之前、默认展开，**是按阅读速度读的** |
| 进括号规则（首次使用 + 加括号） | **不进**，永久 | 上面那 101/272 |
| 进 §3.6 的 needs-closure 规则 | **进** | 它和 chrome 一样是「声称读者已经有这个词」 |

**append 模式的 8 处残余**（术语在 `plain` 里首次出现、而本课主路径从未带括号写过它）。
按 §3.6.3 的「补救代价」切，这 8 处**全部**落在闭包臂——
「已经在被判过的主路径上被命名、只是没带括号」的是 **0 处**（实测）。
放到闭包规则下，**6 处合法、2 处是真违规**：

| 课 | 术语 | 本课 `needs` 闭包里有课把它加括号讲过吗 |
| --- | --- | --- |
| `collisions-cw` | 载荷 | 有（6 门更早的课讲过） |
| `rts-cts` | 空口时间 | 有（8 门） |
| `txop` | 接入类别 | 有（`edca`） |
| `ofdma-ul` | 发射功率 | 有（5 门） |
| `uwb-frame` | 帧头 | 有（9 门） |
| `uwb-nba` | 双边双向测距 | 有（7 门） |
| **`uwb-mms`** | **多毫秒（MMS）** | **没有——而且整个课程在它之前一门也没有** |
| **`uwb-uwbd`** | **多毫秒（MMS）** | **没有**（唯一讲过它的 `uwb-mms-numbers` 不在它的 `needs` 闭包里） |

**多毫秒（multi-millisecond, MMS）是一处真洞**：它是 `uwb-mms` 整课的主角，
而读者在那一课的词表里第一次见到它时，课程主路径从未给过它括号——
唯一给过的是**后面**的 `uwb-mms-numbers`。**这 2 处修掉，另外 6 处不动。**

---

### §3.6 牙：**两条规则、两个臂、6 处**——而分臂的是**渲染位置**，不是字段名

#### §3.6.1 先把 jump 的机制核清楚，因为「指向目的地」那条规则**写不出来**

`JumpTarget` 的全部字段是：

```ts
export interface JumpTarget {        // src/course/lessonKit.ts:22-25
  label: string
  find: (r: TLRecord) => boolean
}
```

**实测，不是读类型读出来的**：273 个 jump 目标，`Object.keys` 并起来**只有
`label` 与 `find` 两个键**（`label:string` 273 次、`find:function` 273 次），
**没有 `to`，没有任何课程 id**。而且 **273 条 jump label 里，没有一条
包含另一门课的标题或 id**（逐条对 83 个标题和 83 个 id 查过）。

`find` 是一个跑在**本课自己录像**上的谓词。界面侧：

```tsx
const jump = (find, label) => { const ok = player.seekFirst(find); ... }   // CoursePanel.tsx:334
```

而同一文件 `:337-343` 的注释把这件事写死了：

> *A jump only makes sense against **this lesson's own recording**: another lesson's
> scene may not hold the moment the jump looks for, and if it does **it is not the one
> the prose is about**.*

**所以 jump label 不是指向另一门课的路标，它是本课时间线上某一刻的标注。**
「它跳过去那门课」不存在，`to` 不存在，**「`to` 指向的课存不存在」这个问题没有指称**。

#### §3.6.2 那条更硬的断路标：**已经有测试在管，83/83 全覆盖**

协调者问得对——有一处比术语更硬的断路标，而它**已经被守着**，
而且守法比「id 存不存在」更强：它断言**那一刻真的在录像里**。

- `tests/course/kit.ts:157-163`：`for (const j of l.jumps) expect(rs.some(j.find), j.label).toBe(true)`，
  跑在 `runOf(l)`——**本课自己的 base run**。同一条里还断言每个 `watch` 块的
  `jump` 下标指向一个真的 `jumps[i]`。
- **覆盖率实测 83/83。** 用 JSON reporter 跑 `tests/course`，
  数 `"<id> · lesson shape"` 这个 describe：**83 个 id，一个不缺**；
  整个套件里名字里带 jump predicate/target 的测试 **120 条**。
- 其中 82 门走 `lessonShapeSuite`；**`amp-slots` 是手写的，而且写得更对**：
  `amp-slots.test.ts:30-34` 说明理由——它 5 个 jump 里有 2 个**只在变体里发生**，
  `lessonShapeSuite` 只跑 base run 会判错，所以它自己逐个按变体断言
  （`:98-108`，`recs(ACWE3)` 与 `recs(TWO_PHASE)`）。

> **我自己量错一次，记下来。** 第一轮我用「测试文件里出现带引号的课程 id」
> 近似「这门课被 `lessonShapeSuite` 覆盖」，得出「8 门课没覆盖」。
> **那 8 门全都覆盖了**——它们把 lesson 对象当变量传进去，源码里从不引用自己的 id 字符串。
> 坏的是尺，不是课程。换成「静态解析 import + `lessonShapeSuite(<ident>)`」
> 得 80/83（剩下 3 个是两处局部变量 + `amp-slots`），再换成
> 「JSON reporter 数 describe 名」才得到 83/83 这个确定答案。

#### §3.6.3 按「补救代价」切，而不是按字段切——而这一刀切下去，**严格臂是空的**

协调者给的口径（我同意它比按字段切更准）：对每一处分别问

- **该术语的中文词在本课主路径上出现过、只是没带括号** → 补救是**就地补括号，零新增课文** → 留严格臂；
- **一次也没出现** → 补救是**往主路径加一段新话** → 走闭包臂。

**按这一个轴切下去，「就地补括号、零新增课文」那一桶是 0 处。而它空不是碰巧，是一条引理。**

**引理**：`tests/course/readability.test.ts` 的括号规则今天在全课程上是 **0 处失败**。
这等价于说：**凡在本课被判过的主路径上被命名过的术语，都已经带着正确的括号。**
所以「在主路径上出现过、只是没带括号」这个格子**在整个课程里是空的**——
不止在那 5 处是空的，在任何字段上都是空的。

**不止证了，还量了**（探针 AP / AS）：

```
(课,术语) 对里，术语确实在被判过的主路径上被命名的：     1058
  ...其中括号规则判「没带括号」的：                        0
  ...其中括号规则判「未判到」的（名字只出现在更长的术语里）：79
```

「某字段里出现、且在主路径上出现、但那里没带括号」逐字段都是 0：

| 字段 | 这样的 `(课,术语)` 对 |
| --- | --- |
| `title` | **0** |
| `variants[].label` | **0** |
| `jumps[].label` | **0** |
| `terms[].plain` | **0** |
| `limits[].text` | **0** |

（那 79 个「未判到」不是违规：它们是名字只以更长术语的一部分出现，
`firstUseIndex` 把更长的术语先遮掉是**对的**——`时隙` 在 `测距时隙` 里、`MPDU` 在 `A-MPDU` 里。）

**结论：按「补救代价」这一个轴切，所有 33 处 chrome 违规与 8 处 gloss 残余
全部落在「需要新增课文」那一侧，没有一处落在「就地补括号」那一侧。**
实测分桶：jump label 术语里「已经在主路径上被命名」的有 **114** 对（本来就不是违规），
「一次也没出现」的 **28** 对；gloss 残余「已经在主路径上」**0**、「一次也没出现」**8**。

> **但「补救代价」不是唯一的轴，而只用这一个轴会切错。**
> 它只问「补救要不要新增课文」，不问「新增的那段话属不属于这门课」。
> **`§3.6.5`–`§3.6.8` 加上第二个轴——渲染位置——而加上之后 `title` 重新独立成一条臂。**
> 所以**不要**从这一节读出「严格规则一概不要」：这一节否掉的是
> **按字段切的那一版**（`title` + `variantLabel` 一律严格），
> 而最终方案是**按渲染位置切**，`title` 臂留下、`variantLabel` 归闭包臂。
> 最终的两臂定义在 §3.6.8，被否掉的那一版记在 §11.1。

#### §3.6.4 那 5 处逐处摊开（**这是被否掉的 v1 抓到的 5 处**，最终判法见 §3.6.8）

| # | 课 \| 术语 | chrome 原文 | 里面出现的是 | 中文词在本课哪儿出现过 | `needs` 闭包里有课加括号讲过吗 |
| --- | --- | --- | --- | --- | --- |
| 1 | `hidden` \| 请求发送 (RTS) | `开启 RTS/CTS（门限 500 B）`（变体标签） | **缩写 `RTS`** | **本课任何地方都没有** | 有：`small-frames`（闭包 14 门） |
| 2 | `hidden` \| 允许发送 (CTS) | 同上 | **缩写 `CTS`** | **本课任何地方都没有** | 有：`small-frames` |
| 3 | `ofdma-dl` \| 下行 (DL) | `OFDMA 下行——一次发送，好几台设备`（**标题**） | 中文词 `下行` | `sources` 与标题自己（主路径没有） | 有：`frame-anatomy`（闭包 18 门） |
| 4 | `mumimo` \| 正交频分多址 (OFDMA) | `OFDMA（按频率划分）`（变体标签） | **缩写 `OFDMA`** | **本课任何地方都没有** | 有：**`ofdma-dl`，而它是 `mumimo` 的直接 `needs`** |
| 5 | **`uwb-mms` \| 参数集** | `参数集 rsf-1`（变体标签） | 中文词 `参数集` | `sources` 与变体标签（主路径没有） | **没有。而且全课程更早的课一门也没加括号讲过它（0）** |

**协调者点名担心的两处，量出来就是他担心的那样：**

- **`mumimo | 正交频分多址`**：变体标签上出现的是**缩写 `OFDMA`**（一个模式名），
  中文全称 `正交频分多址` **在这门课任何地方都没有**。
  严格规则的补救是让 `mumimo` 写出「正交频分多址（orthogonal frequency-division
  multiple access, OFDMA）」——**而 `ofdma-dl` 正是 `mumimo` 声明的直接前置课**
  （`needs: streams + ofdma-dl`），那一课主路径上就带着括号讲过它。
  **所以严格规则在这里确实是「让一门讲多用户 MIMO 的课去替讲 OFDMA 的课开场」。他说对了。**
- **`ofdma-dl | 下行`**：**这门课的标题里就写着「下行」**，
  而它被判过的主路径一次没写 `下行`，缩写 `DL` 也没有（两者都只在 `sources` 里）。
  但 `下行（downlink, DL）` 在 `frame-anatomy` 的主路径上带括号讲过，
  而 `frame-anatomy` 在 `ofdma-dl` 的闭包里，**所以只按补救代价切，它会被闭包臂放过。**
  **它最终没有被放过**：§3.6.5–§3.6.8 加上渲染位置这个轴之后，
  `title` 独立成一条严格臂，**这一处是那条臂今天唯一的一处真红**。
  区别在 §3.6.7：让 `ofdma-dl` 写「下行（downlink, DL）」是
  **让 A 课讲 A 课自己的主角**，不是让 A 课替 B 课开场。
- 另外 `hidden` 那两处同理，而且更清楚：标签是 `开启 RTS/CTS（门限 500 B）`，
  **`RTS/CTS` 是一个开关上的模式名**，要求 `hidden` 为它写出「请求发送（request to send, RTS）」
  和「允许发送（clear to send, CTS）」两句，正是「逼出不属于那门课的话」。

**第 5 处 `uwb-mms | 参数集` 在任何切法下都过不去**：中文词在主路径零出现，
闭包里没有课加括号讲过它，**整个课程更早的课也一门都没有**。
**所以这 5 处里，最终判为违规的是 2 处**——`ofdma-dl | 下行`（走 `title` 臂）
与 `uwb-mms | 参数集`（走闭包臂）；`hidden` 那两处与 `mumimo` 那一处在闭包臂下合法。

#### §3.6.5 `title` 和另三处不是一类东西，而区别在**渲染位置**上可量

把 `title` 单独立一条严格规则，依据**不是「标题更重要」**，是这一条可量的事实：

> **`title` 是这四处里唯一会被印在它自己那门课之外的字符串。**

`src/course/CoursePanel.tsx` 里，一门课的标题有四个渲染点，**三个在别处**（行号逐个核过）：

| 行号 | 渲染什么 | 读者站在哪儿 |
| --- | --- | --- |
| `:312` | `{l.title}` | **目录列表，83 门全列**——读者此刻什么都还没读 |
| `:436` | `LESSONS.find((x) => x.id === id)?.title` | 另一门课的 **`needs` 按钮** |
| `:581` | `L.limitUntil(LESSONS.find((x) => x.id === lim.until)?.title …)` | 另一门课的 **`limits` 旁边** |
| `:586` | `L.limitSeeAlso(…?.title …)` | 同上 |
| `:413` | `{idx + 1} · {lesson.title}` | 本课课头（**唯一一个在自己课内的**） |

另三处**一个跨课渲染点都没有**（核过）：
`variants[].label` 只在 `:490` 渲染 `lesson.variants`；
`jumps[].label` 只在 `:364` / `:503-504` 渲染本课的 `lesson.jumps`；
`terms[].plain` 只在 `:449-453` 渲染 `lesson.terms`。
**三处都只在「正在显示的那一课」里出现，所以 `needs` 闭包的保证在那里是成立的**——
读者要看到那串字，必须已经打开那一课，而打开那一课就意味着它的前置课链条在界面上是摆明的。

#### §3.6.6 而 `:581`/`:586` 比目录那条理由更硬：**`until` 全部指向后面的课**

**实测 16 条边（13 条 `until` + 3 条 `seeAlso`），16/16 指向后面，0 条指向前面或自身。**
位移 delta（按 `COURSE_ORDER` 的序号差）：**最小 +1、中位 +13、最大 +38。**

> **这个中位数量过两次，第一次是 +15，而它和同一句里的「16 条」对不上。**
> 16 条边的中位是 **+13**；+15 是**去重后 15 条**的中位——
> `anomaly → rate-vs-model` 那条 `seeAlso` **由两条不同的 `limits` 各写了一次**。
> 两个数都不错，错的是把它们写进同一句而不说按哪一种数的。
> **16/16 与最大 +38 不受影响，臂一的依据没有动过。**

最锋利的那一条：

```
until  radio-primer(#1) -> fading(#39)   delta=+38
       目标课自己的 needs 闭包里，读者还没走到的有 21 门 [rate-cost, rate-fallback, anomaly, collisions-cw, backoff, …]
```

**读者在课程第 1 门的 `limits` 旁边，读到第 39 门课的标题，而那门课自己的 21 门前置课
一门都还没读。** 这不是「目录里早早看到标题」那种弱意义上的提前——
**这是把一门课的标题印在它自己的前置条件都还没满足的位置上。**
`mcs-ladder(#4) -> fading(#39)`（+35，18 门未达）、`mcs-ladder(#4) -> rate-vs-model(#24)`
（+20，13 门未达）是同一个形状。

另两个跨课渲染点的量级：**8 个不同的标题**被印在别课的 `limits` 里；
**66 个不同的标题**被印成 `needs` 按钮；**83 个**在目录里（读者零阅读量时即可见）。

**所以 `title` 臂的依据是：标题要在没有任何上下文的地方独立成立**，
而另三处的字要在读者已经打开那一课时成立——两条规则的强弱差，
正好对上两组字符串的渲染位置差。**这是依据，不是直觉。**

#### §3.6.7 `ofdma-dl | 下行` 和 `mumimo | 正交频分多址` **不是一回事**

这一句要写下来，因为下一个人会想把这两处并成一条规则：

| | `mumimo \| 正交频分多址` | `ofdma-dl \| 下行` |
| --- | --- | --- |
| 字符串在哪儿 | 变体标签 `OFDMA（按频率划分）` | **标题** `OFDMA 下行——一次发送，好几台设备` |
| 出现的是 | 缩写 `OFDMA`（一个模式名） | 中文词 `下行` |
| 这个术语是谁的主角 | **`ofdma-dl` 的主角** | **`ofdma-dl` 自己的主角** |
| 补上括号等于 | 让 **A 课替 B 课开场** | 让 **A 课讲 A 课自己的主角** |
| 前置关系 | `ofdma-dl` 是 `mumimo` 的直接 `needs` | — |
| 判法 | 闭包臂，**合法** | **`title` 臂，违规** |

**一门标题叫「OFDMA 下行」的课，被判过的主路径一次不用中文写自己的主角**
（`下行` 的 `abbr` 是 `DL`，而 `下行` 与 `DL` 在 `ofdma-dl` 的主路径上**都没有**，
只在 `sources` 里有）。补上「下行（downlink, DL）」**是这门课本来就欠的**。

而 `ofdma-dl` 的标题确实在课外被印了：它在 `COURSE_ORDER` 第 **40** 位，
是 **4 门课**（`ru-diversity`、`ofdma-ul`、`mumimo`、`capstone`）的 `needs`，
所以它的标题被印成 `needs` 按钮 4 次（`:436`），加上目录（`:312`）。
**（它不是任何 `until`/`seeAlso` 的目标——这一处的跨课曝光来自 `:312` 与 `:436`，
不是 `:581`/`:586`。写明，免得把 §3.6.6 那条最强的证据错记到这一处头上。）**

#### §3.6.8 落地：**两条规则，两个臂，6 处真违规**

> **臂一（`title`）**：出现在 `title` 上的词表术语，必须在**本课**被判过的主路径上
> 被加括号地讲过。依据：§3.6.5 的四个渲染点 + §3.6.6 的 16/16 向前。
>
> **臂二（闭包）**：出现在 `variants[].label`、`jumps[].label` 或 `terms[].plain` 上的
> 词表术语，必须在**本课、或本课 `needs` 传递闭包**里某一课的被判过主路径上
> 被加括号地讲过。依据：这三处只在本课内渲染（§3.6.5）。

| 臂 | 来源字段 | 违规 | 逐条 |
| --- | --- | --- | --- |
| 一 | `title` | **1** | `ofdma-dl \| 下行` |
| 二 | `variants[].label` | **1** | `uwb-mms \| 参数集` |
| 二 | `jumps[].label` | **2** | `radio-primer \| 确认帧`、`small-frames \| 聚合 MPDU` |
| 二 | `terms[].plain` | **2** | `uwb-mms \| 多毫秒`、`uwb-uwbd \| 多毫秒` |
| | **合计** | **6** | |

**`title` 臂今天 1 处真红、0 处豁免**——这是它和被否掉的 v1 的全部差别（§11.1）。

四处最硬的，都只有把这些字段纳进网才看得见：

- **`ofdma-dl | 下行`**：标题里写着「下行」，主路径里中文和缩写都没有。
- **`radio-primer | 确认帧`**：课程**第一门**，`needs` 为空（全课程唯一，闭包 0）。
  读者在第一门课的按钮上读到「确认帧」，背后什么都没有。
- **`uwb-mms | 参数集`**：全课程更早的课一门也没加括号讲过「参数集」。
- **`uwb-mms` / `uwb-uwbd` 的「多毫秒」**：它是 `uwb-mms` 整课的主角，
  而唯一加括号讲过它的 `uwb-mms-numbers` 在**后面**。

**验「能失败」要验四次**——两条规则、四个字段臂，证明一个臂能红不够。
### §3.7 这一节的回答，一句话

**「今天就已经违规的」= 0 处**，如果问的是今天实际在跑、而且已经覆盖了这四处的那两条规则（禁词表、自称日期）。
**= 6 处**，如果问的是「本切片用那两条站得住的规则当场判出来、而且补救诚实」的那些（§3.6.8）。
**= 33 处**，如果把 chrome 三处一律按「必须在本课主路径上」判——
而其中 28 条 jump 里的 26 条、5 条 title/variant 里的 4 条，在前置课里都是**带括号讲过的**，
**所以 33 这把尺太粗**。而按「补救代价」切，这 33 处**一处也不落在「零新增课文」那一桶里**
（§3.6.3 的引理），所以严格臂拿不到任何便宜的活。
**= 317 处**，如果问的是「把括号规则原样铺到四处上会红几条」——
而这个数不该被叫做「违规」，因为其中 292 处的字段按同一把尺比 `sources` 和 `deeper` 更该被排除。
## §4 设计的核心问题：遍历怎么知道哪些字符串是「给读者读的中文课文」

### §4.1 先把问题拆对：这个问题只有一条规则需要回答

两类规则的**判据形状**不同，这决定了它们对「哪些字符串算课文」的需求不同：

- **子串禁令**（禁词表 86 条、自称日期 4 条模式）是**无序、无上下文**的。
  多给它文本只会多抓，不会错抓——除了 `allow` 那几条合法长词，而那也是子串判断。
  **它根本不需要知道哪些字符串是课文：给它全部。**
  **这一句是实测的，不是推理的**：把 86 条禁词 + 4 条自称日期模式跑在
  **整个 `Lesson` 对象的无条件遍历**上——不按字段名取、不加 CJK 筛、
  连 `id`、`needs`、`kind`、`until`、图的节点 id 与色调全都喂进去，
  **11 735 条字符串，BAN 命中 0、ROT 命中 0**（探针 AB）。
  也就是说，这两条规则喂全量不会产生一条误报。
- **首次使用 + 加括号**（口径表）是**有序、而且补救敏感**的。
  多给它文本会造出它**无法被诚实修好**的失败（§3.6 的按钮，§3.5 的术语表）。
  **只有它需要一个选择器。**

于是「遍历怎么知道」这个问题的答案是：**它不需要知道。**
遍历的职责只有一条——**一个字段都不漏**；分类的职责在规则一侧。

### §4.2 实测：纯结构遍历会纳进什么不该管的

把整个 `Lesson` 对象无条件走一遍（跳过函数，不看字段名），得到 **91 个字段族**。
brief 担心的四类东西确实都会进来，而实测它们**全都不含汉字**：

| 会被纳进来的非课文 | 条数 | 含汉字 |
| --- | --- | --- |
| `limits[].kind` | 368 | **0** |
| 块的 `kind`（`picture`/`numbers`/`deeper`） | 530 | **0** |
| `terms[].term` | 272 | **5** |
| `needs[]`（课程 id） | 160 | **0** |
| `id` | 83 | **0** |
| `limits[].until` / `limits[].seeAlso` | 13 / 3 | **0 / 0** |
| `widget` 名 / `params` 值 | 2 / 9 | **0 / 0** |
| 图的几何与 id（`spec.*.from`/`.to`/`.id`/`.role`/`.tone`） | ~400 | **0** |

**`zhChars(s) > 0` 这一把筛子，一次筛掉上面全部，只剩 5 条**——
`terms[].term` 里标准自己的拼法恰好是中文的那五个：
`成员那一份`、`成员的格数`、`起始格`、`频率分集`、`被截掉的那一格`。
（其中 4 条是 `lessonStrings` 今天不返回的；1 条与别处字面重合。）

而这把筛子**不是新发明的判据**：`HAS_CJK`（`readability.ts:28`）已经是 `cellTexts`
判断「一个表格单元是不是被当成语言读的」的全部依据，字符区间与 `zhChars` 用的那个一字不差。
**所以「是不是中文课文」在这个仓库里早有一个定义，并且已经在用。**

### §4.3 筛子的代价，以及谁会因此失明

CJK 筛子会丢掉 `lessonStrings` 今天返回的 **2 125 条纯 ASCII 字符串**：

```
numbers 1961 · picture 104 · deeper 57 · quiz 3        （样本：46.7 / −31.7 dBm / 172.1 Mb/s / PHY-TXSTART.request）
```

逐条核过后果：

1. **`mainPathChars` 一个字都不变。** 它把 `zhChars` 加起来，而纯 ASCII 字符串的 `zhChars`
   恒为 0。**这不是实测出来的巧合，是定义上的恒等**（筛子就是 `zhChars > 0`）。
2. **禁词表不丢任何东西**：86 条禁词全是 CJK 子串。
3. **自称日期会丢东西。** 四条模式里有一条是 ISO 日期 `\d{4}-\d{2}-\d{2}`，**纯 ASCII**。
   今天纯 ASCII 字符串里带 ISO 日期的有 **0 条**，但「今天是 0」不是「以后也是 0」——
   一个写在值单元格里的 `2026-10-03` 会从一个加了筛子的网里漏掉。
4. **契约形状套件会丢覆盖**：`kit.ts:168-174` 与 `readability.test.ts:82-97` 检查
   「每个字符串非空」（今天全课程空串 **0 条**）。那是一个**非空检查**，与「是不是课文」无关，
   丢掉 2 125 条就是丢掉 2 125 条覆盖。

**结论：筛子必须是每条规则自己的选择器，不能是遍历的属性。**
遍历返回全部；禁词表与非空检查用全部；自称日期用全部；口径表用标签 + 筛子。

### §4.4 图（`spec`）那个特例必须留下

`lessonStrings` 今天对 `spec` 有一个特例（`:144`）：不走进去，而是交给
`diagramTexts`。核过为什么：纯结构遍历走进一份 `spec` 得到 **852 条字符串（262 条含汉字）**，
而 `diagramTexts` 给出 **420 条**。两者不是包含关系——`diagramTexts` 是**挑过的**
（只要 label，不要节点 id、链路两端、色调、坐标），而且按读者遇到的顺序给。
`readability-rules.test.ts:57-59, 74-77` 把这个顺序钉死了。**特例留下，并且点名。**

### §4.5 所以设计是这样

```ts
/** 一门课里一个给读者的字符串，带它从哪儿来。 */
export interface LessonText {
  section: Section      // 读者看到的那一块
  role: Role            // 这一块里它是哪一类字
  path: string          // 'numbers[3].rows[1][2]'，失败消息里指得到人
  text: string
}
/**
 * 五类，而这五类**不是新造的**：它们正是 `paragraphTexts`/`cellTexts` 今天已经
 * 分开的那几类，只是今天分在两个函数里、靠调用方记住要调哪个。
 *  prose  — 小标题、段落、watch 文案、list/steps 条目、formula 的 note、widget 的 caption
 *           （= 今天 `paragraphTexts` 返回的全部，除 figure）
 *  figure — `diagramTexts(spec)` + diagram 的 caption（顺序由 `diagramTexts` 定，§4.4）
 *  cell   — table 的 head 与 rows（今天 `cellTexts` 只收其中含汉字的）
 *  value  — formula 的 text 本体（今天 `paragraphTexts` 故意不收，`:40-41` 写明理由）
 *  label  — title、variants[].label、jumps[].label
 */
export type Role = 'prose' | 'figure' | 'cell' | 'value' | 'label'
export type Section =
  | 'title' | 'why' | 'outcomes' | 'terms' | 'body' | 'picture' | 'numbers'
  | 'deeper' | 'sources' | 'limits' | 'observe' | 'tryThis' | 'quiz'
  | 'variantLabel' | 'jumpLabel'

/** 整个 Lesson 对象走一遍，不按字段名取，只按字段名排除。 */
export function lessonTexts(l: Lesson): LessonText[]
```

- **排除表**（不是包含表），而且每一条都带理由：
  `scenario` / `jumps[].find`（函数，本来就跳）、`id` / `module` / `needs` / `limits[].until`
  / `limits[].seeAlso`（标识符，不是文案）、`kind` / `widget` / `params`（判别式与控件预设）、
  `terms[].term`（标准自己的拼法，不是译文——`readability.ts:106` 今天的理由，原样留）、
  `quiz[].answer`（数字）、`picture[].jump`（下标）。
- **`spec` 走 `diagramTexts`**，打 `role: 'figure'`。
- 每条规则按标签选：

| 规则 | 选择器 | 落地后新增失败（实测） |
| --- | --- | --- |
| 禁词表 `wording.test.ts` | **全部**，不筛 | **0** |
| 自称日期 `ROTS` | **全部**，不筛 | **0** |
| 非空检查 `kit.ts` / `readability.test.ts` | **全部**，不筛 | **0** |
| 口径表（括号规则） | `section ∈ {why, outcomes, body, picture, numbers, observe, tryThis, quiz}`，且 `role ∈ {prose, figure}`，外加 `role === 'cell' && zhChars(text) > 0`——**`value` 与 `label` 排除，即今天 `paragraphTexts` + `cellTexts` 的那一套，一字不改** | **0**（构造上相等，§9.3 钉住） |
| **标题臂（新，臂一）** | `section = 'title'`，本课主路径 | **1**（§3.6.8） |
| **前置闭包臂（新，臂二）** | `section ∈ {variantLabel, jumpLabel, terms}`，配 `needs` 传递闭包 | **5**（§3.6.8） |
| ~~按字段切的严格臂（v1）~~ | ~~`section ∈ {title, variantLabel}`~~ | **否掉**（§11.1）：抓 5 条，其中 4 条是错抓 |
| `limits` 棘轮（新） | `section = 'limits'`，判据 Q | 钉在 **289**（§3.4、§8 第 4 步） |
| `mainPathChars` | `section ∈ {why, outcomes, terms, body, picture, numbers, observe, tryThis, quiz}` | **0 门课的分钟数改变**（§6） |

---

## §5 新字段默认进网还是不进网，以及怎么让遗漏当场变红

### §5.1 默认**进网**

排除表的语义就是默认进网：一个新字段，如果没人把它写进排除表，
`lessonTexts` 就会返回它，于是禁词表、自称日期、非空检查**在它被加上的那一刻**就看得见它。
这是 brief 问的那个问题的答案，而它不是口味：
**今天的根就是「默认不进网」**——`lessonStrings` 的手搭对象只列了 11 个字段，
`Lesson` 有 19 个键，于是 `title`、`limits`、`variants`、`jumps` 这四个默认在网外，
而 `lessonKit.ts:117-127` 只能用一段注释拜托后来人。

### §5.2 分类必须是**全覆盖的**，而编译期红**在这个仓库里不够**

`section` 从一张显式映射来：

```ts
const SECTION_OF: Record<keyof Lesson, Section | null> = { /* 19 个键，一个不漏 */ }
```

`Record<keyof Lesson, …>` 让「给 `Lesson` 加第 20 个字段而不分类」成为**类型错误**。
**但这在本仓库不足以当网，必须写下来**：`package.json` 的 `test` 是 `vitest run`，
vitest 用 esbuild 转译、**不做类型检查**；`tsc -b` 只在 `build` 里。
**所以一个类型错误不会让 6 712 条绿变红。**

补一道**运行期**的：`lessonTexts` 遍历 `Object.keys(l)`，遇到 `SECTION_OF` 里没有的键
就 `throw`。于是一门课**真的写了**新字段的那一刻，83 门课同时红，
失败消息里是那个键名和那门课的 id。

这道闩自己也要被判过（否则就是又一条「报告成功却什么也没判」的规则，
`readability.test.ts:234-239` 为此专门立过一条守卫）：
一个合成课程对象 `{ ...realLesson, newField: '一句中文' }` 必须让 `lessonTexts` 抛，
而 `{ ...realLesson }` 不抛。两条断言，写在 `readability-rules.test.ts` 里。

### §5.3 第三道：普查，它还能抓反向的失败

逐 `section` 钉住全课程的（字符串条数，汉字数）：

```
title 83/901 · why 83/10775 · outcomes 264/6425 · terms 272/7131
picture …/52012 · numbers …/59415 · deeper …/26076 · sources 266/16670
limits 368/47129 · observe 196/9956 · tryThis 138/9058 · quiz …/24443
variantLabel 147/842 · jumpLabel 273/2147
```

一个带课文的新字段会把普查推出去（红，消息里说哪一块长了）；
**而一个悄悄停止工作的走法也会**——这正是 `readability-rules.test.ts:1-11` 担心的失败
（*a walk that quietly stopped seeing a block kind would let a whole section go ungraded
without a single test turning red*），而它今天只守着合成 fixture，不守着真课程。

普查用的是**不等式还是等式**，要分字段定：课文会增删，所以汉字数用区间
（如 `limits` 在 45 000–50 000），**条数用等式**（`title` 恰好 83 = 课程门数，
`limits` 恰好 368，`jumpLabel` 恰好 273）。条数等式是真正会被新字段推动的那一列。

### §5.4 三道闩各自能怎么失败（逐条写出可以失败的那一下）

| 闩 | 失败的那一下 | 在哪儿跑 |
| --- | --- | --- |
| 排除表默认进网 | 新字段写了中文且撞上 86 条禁词之一 → `wording.test.ts` 红 | `vitest` |
| `Record<keyof Lesson, …>` | `Lesson` 加键而不分类 → `tsc -b` 失败 | **只有 `npm run build`** |
| 运行期抛 | 某门课真的写了新字段 → 83 门课同时红 | `vitest` |
| 普查条数等式 | 新字段带来 >0 条字符串 → 普查红 | `vitest` |

**第二道只在 build 里**这件事必须写进落地清单：要么把 `tsc --noEmit` 挂进测试脚本
（超出本切片），要么接受第三、四道承担它，并在代码注释里写明为什么有两道而不是一道。

---

## §6 分钟数：会不会变，哪些课变，变多少（实测，不是推理）

公式：`lessonMinutes = round((mainPathChars/220 + 2·observe + 4·tryThis) / 5) · 5`，
下限 5、上限 30（`curriculum.ts:450-457`；`MAX_MINUTES` 由 `kit.ts:146-152` 与
`readability.test.ts:114` 两处断言）。全课程今天的分钟数之和 = **1 740**。

### §6.1 推荐方案下：**一门课也不变**

`mainPathChars` 的选择器与今天的手搭对象取同一组 section
（why / outcomes / terms / body / picture / numbers / observe / tryThis / quiz），
**所以它返回同一个数**。实测方式见 §15：钉住 `mainPathChars` 的全课程和 = **179 215**
与分钟数之和 = **1 740**。

### §6.2 如果把 chrome 三处加进 `mainPathChars`：**7 门课各 +5 分钟**

```
rts-cts 10→15 · rate 20→25 · ofdma-ul 20→25 · uwb-reply-time 25→30
uwb-m2m 25→30 · uwb-sensing 20→25 · uwb-mms-numbers 20→25
```
0 门课破 30 分钟上限。总和 1 740 → 1 775。

### §6.3 如果把 `limits` 也加进去：**50 门课变，6 门破上限**

破上限的六门（这会让 `kit.ts:152` 与 `readability.test.ts:114` 当场红）：

```
selectivity 30→35 · ru-diversity 30→40 · uwb-rcm-validity 30→35
uwb-receipt 30→35 · uwb-sp3 30→35 · uwb-ancillary 30→35
```

另有 `ofdma-dl 20→30`（一次跳两档）。今天已经顶在 30 分钟的有 8 门
（`selectivity`、`ru-diversity`、`amp-slots`、`amp-coexist`、`uwb-rcm-validity`、
`uwb-receipt`、`uwb-sp3`、`uwb-ancillary`）。

### §6.4 表态

**这一刀不动分钟数，并且把它钉住。** 三条理由，按分量排：

1. **已发布的分钟数是读者看得见的**（`CoursePanel.tsx:389`，课头的 `L.minutes(...)`）。
   为了一次走法重构去移动 7 个（或 50 个）读者看过的数字，换来的真实度是 2.17 %——
   而那 2.17 % 里，`title` 是读一次的标题、`label` 是点的按钮，**本来就不是按阅读速度读的**。
   把它们算进阅读时间是把估计做得更不准，不是更准。
2. **真正缺的那一块是 `limits`：47 129 字、主路径的 26.30 %、默认展开、一分钟也没算。**
   这是一笔真账，而还它要动 6 门课的篇幅（拆课），**那是另一刀**，不是走法重构的副作用。
   这份规格把它量到这个程度，就是为了让那一刀不必重新量。
3. **顺手改掉它，比留着它更危险**：50 个分钟数一起变，没有任何测试能告诉读者
   哪一个是因为课文真的长了、哪一个是因为尺换了。

### §6.5 留一把尺：margin 小到 1 个汉字

分钟数离翻档边界有多远（四舍五入到 5 分钟，边界是 2.5 分钟 = 550 汉字）：

```
rate            差 1 个汉字   就会 20→25
uwb-reply-time  差 4 个汉字   就会 25→30
uwb-m2m         差 6 个汉字
ofdma-ul        差 9 个汉字
rts-cts         差 12 个汉字
uwb-sensing     差 25 个汉字
```

**`rate` 只差 1 个汉字。** 所以「`mainPathChars` 的走法改了而分钟数没变」
这件事不能靠事后看一眼，必须有断言——这正是 §5.3 普查里
`mainPathChars` 总和 **179 215** 与分钟数总和 **1 740** 两个数的用处。
把这两个数写进测试，`rate` 的 1 个汉字就再也不会悄悄过去。

---

## §7 三条路，各自的代价

### (a) 继续列字段名，把漏的四处补进 `lessonStrings`

**代价一：下一个新字段还是隐身。** 这是 brief 自己指出的，而它是对的：
形状不变，`Lesson` 的第 20 个键默认还是在网外。
**代价二：它会动分钟数。** `mainPathChars` 调用 `lessonStrings`，
把四处加进 `lessonStrings` 就等于 §6.3 的 50 门课变、6 门破上限——
除非 `mainPathChars` 自己再写一份排除表，于是手搭表从 2 处变 3 处。
**代价三（也是它最致命的一条）：它修不到真正漏的那一条。**
口径表走 `paragraphTexts`/`cellTexts`，**根本不经过 `lessonStrings`**
（`readability.test.ts:184-189`）。所以把四处加进 `lessonStrings`，
口径表的覆盖**一点也不变**——而口径表是三条措辞规则里唯一真的漏掉这四处的那条（§3）。
(a) 付出了动 50 个分钟数的代价，换来的覆盖增量在措辞规则上是零。
**否掉。**

### (b) 结构遍历 + CJK 筛子，一刀全纳（一个走法喂所有规则）

**代价一：自称日期规则的 ISO 日期臂会失明**（§4.3 第 3 条）。
**代价二：非空检查丢 2 125 条覆盖**（§4.3 第 4 条）。
**代价三：口径表会凭空红 317 条**，其中 292 条的字段按同一把尺比 `sources`/`deeper`
更该被排除（§3.4）——这不是修 bug，是把一条判据铺到它不成立的地方。
**代价四：它会动分钟数**（§6.3），因为 `terms[].term` 的 5 条中文和四处会一起进去。
**否掉，但它的遍历部分是对的**——(c) 用它的遍历，不用它的「一刀」。

### (c) 结构遍历 + 标签选择器

**代价一：标签表本身要维护，而且是一张 19 行的全覆盖表。**
这是真代价，而换来的是「漏一个字段」从**静默**变成**抛异常**。
**代价二：`section` 的粒度是一个判断。** 比如 `limits` 是一个 section 还是三个
（`text` / `until` / `seeAlso`）——按 §1.4，只有 `text` 含课文，所以一个就够，
`until`/`seeAlso` 进排除表。这个判断会被下一个字段再问一次。
**代价三：改动面比 (a) 大**：10 处手搭的读者文本走法要收敛（§9）——
其中 9 处共用 `readerTexts`，第 10 处（口径表）换成 `gradedProseTexts`。
**代价四：它必须带一条真有牙的规则落地，否则是「允许但空转」**（§11）。
**推荐这一条。**

---

## §8 推荐：(c)，落地顺序

1. **`lessonTexts` + `SECTION_OF` + 运行期抛 + 普查。** 行为零变化（0 条新失败，实测）。
   这一步单独落地**什么也不改**，所以它不能单独落地（§11）。
2. **把取读者全文的那 9 处（#4–#12）收敛到 `readerTexts(l) = lessonTexts(l)`**，
   禁词表、自称日期、非空检查三条规则用它。实测 **0 条新失败**。
   这一步之后，§1.1 的 7 种 ad-hoc 组合变成 **4 个有名字、有理由的选择器**：
   `readerTexts`（9 处共用一个）、`gradedProseTexts`（#3 口径表）、
   `lessonStrings`（#1，行为不变，约 30 个 per-lesson 测试照旧用）、
   `mainPathTexts`（#2 分钟数）。**4 个各写明它为什么不是另外三个**。
3. **那两条新规则落地，而且把那 6 处课文真的修掉**（§3.6.8）。
   **不设台账** —— 6 处是一刀能修完的量，台账只在数目大到修不完时才是诚实的做法。
   逐条：
   - **`ofdma-dl | 下行`（臂一，标题）**——标题是 `OFDMA 下行——一次发送，好几台设备`，
     而被判过的主路径上 `下行` 与 `DL` **都没有**（只在 `sources` 里）。
     补「下行（downlink, DL）」，这是 A 课讲 A 课自己的主角（§3.6.7）。
   - `uwb-mms | 参数集`（变体标签 `参数集 rsf-1`）——全课程更早的课一门也没加括号讲过它。
   - `radio-primer | 确认帧`（jump label）——课程第一门，`needs` 为空，闭包 0。
   - `small-frames | 聚合 MPDU`（jump label）——闭包 6 门一门没提过，讲它的 `ampdu` 在后面。
   - `uwb-mms | 多毫秒`、`uwb-uwbd | 多毫秒`（`terms[].plain`）——
     唯一加括号讲过它的 `uwb-mms-numbers` 在后面。
   臂二的修法三选一：在本课主路径上写一句、补一个 `needs`、或改标签措辞；
   **臂一只有一条路**——在本课主路径上写出来，因为标题是本课自己的声明。
   **要有四个「能失败」的证明**（两条规则、四个字段臂）。
   `needs` 传递闭包要写成一个小函数并单测（`radio-primer` 闭包为 0 是它的边界用例，
   最大闭包 38，全课程只有 `radio-primer` 没有前置课）。
4. **`limits` 棘轮，钉在 289（判据 Q）。** 一条断言：`(课, 术语)` 对里
   「在 `limits` 中被命名、而本课被判过的主路径从未命名」的**不多于 289 个**。
   它不要求任何人今天去修 289 条，但它让这笔账可见，并且禁止第 290 条。
   **断言旁边必须写明它不是 292**（§3.4 的两个判据），否则下一个人会以为有人写错了数。
5. **分钟数的两个数写进测试**（179 215 / 1 740），§6.5 的 `rate` margin 写进注释。

**第 3 步是这一刀的牙，而它现在真的有活干：6 处课文。**
没有它，前两步可证明地不改变任何东西（§11）。

---

## §9 要改的文件与测试，逐条

### §9.1 `src/course/readability.ts`

- 新增 `Section`、`LessonText`、`SECTION_OF`、`lessonTexts`、以及四个选择器
  `readerTexts` / `mainPathTexts` / `gradedProseTexts` / `chromeTexts`。
- `NOT_PROSE`（`:106`）扩成带理由的排除表，并加入 `id`、`module`、`needs`、
  `until`、`seeAlso`、`answer`、`jump`。**理由逐条留**：`term` 那一条的理由
  （标准自己的拼法）是今天注释里就有的，原样搬。
- `lessonStrings`（`:131`）**行为不变**，改成 `lessonTexts` 的一个 section 选择器。
  它有约 30 个 per-lesson 测试调用，**那些调用一个都不改**。
- `mainPathChars`（`:165`）改成 `mainPathTexts` 的 `zhChars` 之和。**返回值逐课相等**。

### §9.2 `src/course/lessonKit.ts`

- `Limit.seeAlso` 的 docblock（`:117-127`）里那段「两处走法靠字段名、新字段会隐身、
  谁改这个字段必须同期扩两处走法」的口头纪律，**换成指向 `lessonTexts` 的一句**：
  纪律由排除表 + 运行期抛承担，不再由记性承担。
  **这是这一刀唯一碰 `lessonKit.ts` 的地方，而且只碰注释。**

### §9.3 `tests/course/readability.test.ts`

- `readerText`（`:452-457`）→ `readerTexts`。
- `everything`（`:527-530`）→ `readerTexts`。
- `zhMainTexts`（`:184-189`）→ `gradedProseTexts`，**并在落地提交里加一条一次性相等断言**：
  对 83 门课，`gradedProseTexts(l)` 与旧 `zhMainTexts(l)` 逐条相等。
  这条断言落地后可以删（旧函数会跟着删），但**必须在同一个提交里跑过一次**。
- `:485-491` 那条反空转守卫（「`lessonStrings` 仍然不含 `limits`，而 `readerText` 含」）
  **会红，而它是故意写成会红的**（`:479-484` 的注释原话：
  *if `lessonStrings` ever starts walking `limits`, this line goes red and `readerText`
  can be simplified on purpose instead of by accident*）。
  **注意：`lessonStrings` 在本方案里行为不变，所以第一条断言仍然成立**；
  要改的是第二条的函数名。**这正是作者当年留的那把尺按预期响了一次，照它说的办。**
- 新增**两条**规则（§3.6.8）：**臂一** `title` → 本课被判过的主路径；
  **臂二** `variantLabel` / `jumpLabel` / `terms[].plain` → 本课或 `needs` 传递闭包。
  `needs` 的传递闭包要写成一个小函数并单测（`radio-primer` 闭包为 0 是它的边界用例，
  最大 38，全课程只有 `radio-primer` 没有前置课）。
- **臂一的 docblock 要写它的依据，而且写成行号**：
  `CoursePanel.tsx:312`（目录 83 门全列）、`:436`（别课的 `needs` 按钮）、
  `:581`/`:586`（别课 `limits` 旁的 `limitUntil`/`limitSeeAlso`），
  外加「16 条 `until`/`seeAlso` 边 16/16 指向后面的课，中位 +13、最大 +38」。
  **不要写成「标题更重要」**——那句话挡不住下一个人把两臂并成一条。
- **把「被否掉的 v1 是按字段切的那一版」写进同一个 docblock**（§11.1），
  连同那条引理（括号规则基线 0 失败 ⟹「主路径上有、只是没括号」全课程为空），
  否则下一个人会把 `title` 臂当成 v1 的残留而拆掉它。
- **§3.6.7 那句差别要写进臂一的 docblock**：
  `ofdma-dl | 下行` 是 A 课讲 A 课自己的主角，`mumimo | 正交频分多址` 是 A 课替 B 课开场,
  **两者不能并成一条规则**。
- 新增 `limits` 棘轮（289，判据 Q，旁注它为什么不是 292）；新增普查与分钟数两个数。
- **`terms[].plain` 永久不进括号规则的理由要写进 docblock**（272 行里 101 行的 gloss
  借用了别的词表术语，§3.5），否则下一个人会把它当成又一处漏网再补一遍。

### §9.4 `tests/course/wording.test.ts`

- `readerText`（`:46-53`）→ `readerTexts`。`:33-43` 的 docblock 要改：
  那段话现在解释「为什么手加四处」，改成「为什么不再需要手加」，
  **并保留它记下的那三处真货**（`limits` 里的 底噪、jump label 里的「挤进」、三个标题），
  因为那是这条规则能抓到东西的证据。

### §9.5 `tests/course/kit.ts`

- `:164-167` → `readerTexts`。`:168-174` 的注释（那条被量过之后删掉的结构下限）
  原样留，它记的是另一件事。

### §9.6 五个 per-lesson 测试

`ru-diversity.test.ts:145-149`、`selectivity.test.ts:114`、`uwb-sensing.test.ts:337`、
`uwb-sensing-resolution.test.ts:299`、`uwb-ssbd.test.ts:402` → `readerTexts`。
收敛之后它们看到的文本只会变多不会变少。

**这里本来写着「它们的断言全是 `toContain` 形状，所以只会更容易通过」——那句是假的，
查过之后划掉。** 其中三处有 `not.toContain` 跑在要被加宽的那个变量上：

- `selectivity.test.ts:195-198, 240, 407`：10 个 needle（`三倍于应得`、
  `按整帧的带宽给格数`、`整帧带宽的格数`、`高估`、`所以它永远只有九格`、
  `14、44`、`44、47`、`871`、`252`、`并不单调`）跑在 `text` 上，
  而 `text` 今天是 `{lessonStrings + title + limits}`，加宽会多出 8 条 label。
  **实测那 8 条 label 是**
  `20 MHz`／`40 MHz`／`80 MHz`／`160 MHz`／`320 MHz`／`第一个数据帧`／`第一条合成记录`／`第一次没解出来的接收`，
  **10 个 needle 一个都不在里面 → 不会变红。**
- `uwb-sensing.test.ts:365` 与 `uwb-sensing-resolution.test.ts:329`：
  `for (const t of readerText(l)) expect(t).not.toContain('没有建模多径')`，
  跑在**全部 47 门 Wi-Fi 课**上。加宽会多出各课的 label。
  **实测：没有一门 Wi-Fi 课的 label 含「没有建模多径」→ 不会变红。**
- `uwb-ssbd.test.ts:402` 的 `everything` 上没有 `not.toContain`。
- `ru-diversity.test.ts:145-149` 今天就已经四处全有，加宽不给它任何新字符串。

**所以结论仍然成立（这五处不会变红），但它是量出来的，不是从断言形状推出来的。
落地时这三条必须真的跑一次**——而且这正是为什么 §8 把「收敛走法」排在
「加新规则」之前的单独一步：它要能单独证明零行为变化。

（`ru-diversity.test.ts:151` 的 `mainText` 与 `:156-157` 的 `deeperText`/`limitsText`
是**分段**取文本，用来断言「这个数印在主路径上而不是在 `deeper` 里」，
`:366, 390, 396-397, 687-688` 的 `not.toContain` 全跑在 `mainText` 上。**这三个变量不动。**）

### §9.7 `tests/course/readability-rules.test.ts`

- 新增 `lessonTexts` 的单元测试：标签正确、排除表生效、`spec` 走 `diagramTexts`
  且顺序不变、未分类键会抛、已分类键不抛。
- `:62-78` 那组 `lessonStrings` 断言**保持原样通过**（行为不变是本方案的要求之一）。

### §9.8 明确不碰

`src/ui/store.ts`、`src/ui/App.tsx`、`tests/ui/store-course.test.ts`、
`src/player/player.ts`——本会话另有一刀在改这四个文件。
本方案不读它们的内容、不依赖它们的任何行为：`lessonTexts` 住在 `src/course/`，
`CoursePanel.tsx` 只被本规格引用行号（渲染位置），**不需要改**。

---

## §10 `tests/fixtures/` 的影响：**零**。核过

本方案不动 `scenario()`、不动 `variants[].scenario()`、不动引擎、不动任何场景字段。
录制哈希是时间线的哈希（`kit.ts:131-132` 的 `lesson-hashes.json` 与
`uwb-record-hashes.json`），而时间线来自 `Simulation(scenario).runUntil(ns)`。
**课文、标题、标签、`limits` 文本都不进场景。**
**绝不跑 `UPDATE_HASHES=1`。** 落地后 `git diff --stat tests/fixtures/` 必须是空的。

---

## §11 允许但空转：这一刀自带一个，指名道姓

**它是第 1 + 2 步单独落地。**

实测过了：把 `lessonTexts` 建起来、把那 10 处手搭走法全部换成四个命名选择器，
禁词表 **0 条新失败**、自称日期 **0 条新失败**、非空检查 **0 条新失败**、
`mainPathChars` **逐课相等**、分钟数 **一门不变**、fixture **零 diff**。
**也就是说，这个重构可证明地不改变这个仓库的任何一个可观测行为。**
它会看起来像一刀做完了：12 处手搭的表变成 4 个有名字的选择器，根被堵上，全绿。
而读者仍然在 `capstone` 的按钮上读到这门课没教的「数据帧」。

**所以第 3 步（那两条规则 + 6 处课文）不是可选项，它是这一刀的牙。**
判断它有牙的办法是现成的，而且要验**四次**——两条规则、四个字段臂
（`title` / `variantLabel` / `jumpLabel` / `terms[].plain`），
一次只证明一个臂能红是不够的：
把 `ofdma-dl` 的「下行（downlink, DL）」补句删掉，**臂一**必须红；
把 `uwb-mms` 的「参数集」补句删掉，臂二的 `variantLabel` 必须红；
把 `radio-primer` 的「确认帧」补句删掉，臂二的 `jumpLabel` 必须红；
把 `uwb-mms` 的「多毫秒」括号删掉，臂二的 `terms[].plain` 必须红。
**这四下要在落地提交里真的做一次。**

第二个候选的空转：`limits` 棘轮钉在 289。它不要求任何人修任何东西。
它不是空转，因为第 290 条会红——**而这件事也要验一次**：
往任一门课的 `limits` 里塞一个主路径没有的术语，棘轮必须红。

### §11.1 被否掉的 **v1**：按**字段**切的严格臂

> **这一节批评的是一个已经不在纸面上的方案。** 最终方案有一条 `title` 严格臂
> （§3.6.8 臂一，1 处真红、0 处豁免），它**不是**这里被否掉的东西。
> 被否掉的是**我第三轮提的 v1**：把 `title` **和** `variantLabel` 一起按
> 「必须在本课主路径上讲过」判。两者的差别是切的轴不同——
> **v1 按字段切，最终版按渲染位置切**（§3.6.5 的四个渲染点、§3.6.6 的 16/16 向前）。
> 留这一节是因为 v1 的坏法本身值得记：它正是本节要防的形状的另一面。

**v1 不是「空转」，它比空转更坏——它今天抓着 5 条，而其中 4 条是错抓。**

- v1（「`title` 与 `variantLabel` 上的术语都必须在**本课**被判过的主路径上讲过」）
  今天抓 **5 条**，所以不是空转。
- 但按「补救代价」切，这 5 条**一条也不在「零新增课文」那一桶里**——
  那一桶是空的，而且**可证明是空的**（§3.6.3 的引理）。
- 而这 5 条里 **4 条**（`hidden|请求发送`、`hidden|允许发送`、`ofdma-dl|下行`、
  `mumimo|正交频分多址`）在本课 `needs` 闭包里**带着括号讲过**，
  其中 `mumimo` 的那一条，讲它的 `ofdma-dl` 就是 `mumimo` 的**直接前置课**。
  **按这条规则去修，就是让一门讲多用户 MIMO 的课替讲 OFDMA 的课开场。**
- 所以 **v1** 留着的唯一活法是配一张 4 条的豁免台账——
  **一条 80 % 由豁免构成的规则**。修掉第 5 条之后是 100 %。
- **而最终版的 `title` 臂没有这个毛病**：它今天抓 **1 条**（`ofdma-dl | 下行`），
  **豁免 0 条**。那 4 条错抓里有 3 条是 `variantLabel`（`hidden`×2、`mumimo`），
  第 4 条就是 `ofdma-dl | 下行` 本身——**而它在最终版里不是错抓，是真红**（§3.6.7）。
  **换一个轴，同一处课文从「错抓」变成「真红」**，这就是为什么轴选对了比规则写严写松重要。

**这就是本节要防的那个形状的另一面**：§11 开头说的是「加了网却什么也没变」，
这里说的是「加了条会红的规则，而它红在对的课文上」。
**两者都让一刀看起来做完了，而第二种还会顺手把正确的课文改坏。**

**否掉 v1，不设台账，理由进 docblock**（§9.3）——
写明被否掉的是「按字段切」而不是「严格规则本身」，
否则下一个人读到这一节会以为 `title` 臂也该拆掉。

---

**第三个候选，而且是最隐蔽的一个：把 jump label 当成「指向别处的路标」而放它一马。**
那会让 28 处里的 26 处合法化（它们确实合法）**连带把剩下 2 处也放掉**，
其中一处是 `radio-primer` 第一门课按钮上的「确认帧」、背后一门前置课都没有。
**一条「因为指向别处所以不管」的豁免，在这个仓库里是无指称的**
（`JumpTarget` 没有目的地，§3.6.1），而它会买走这一刀最硬的那一处发现。

---

## §12 明确不做

1. **不动分钟数**，一个都不动（§6.4）。不加 chrome、不加 `limits`、不改 `CHARS_PER_MINUTE`。
2. **不把括号规则铺到 `limits` 上**（292 条）、**不铺到 `deeper`/`sources` 上**（261 条）、
   **不铺到 `terms[].plain` 上**（prepend 154 条是测法的错，§3.5）。
   `terms[].plain` 的 8 条残余归 §3.6 那一条闭包判据管：**其中 2 条（都是多毫秒）本切片修掉，
   另外 6 条在 `needs` 闭包里本来就合法，不动**（§3.5）。
3. **不动 `Limit` 的类型**。`until`/`seeAlso` 继续只存 id；它们进排除表。
4. **不把 `ZH_TERMS` 的 181 行、`ZH_TERMS_EXCLUDED` 的 26 行动一个字。**
5. **不动 `diagramTexts` 的挑选与顺序**（§4.4）。
6. **不按「必须在本课主路径上」去判 `variantLabel` / `jumpLabel` / `terms[].plain`**——
   那把尺（33 处）里 28 条 jump 的 26 条、`variantLabel` 的 3 条都是错抓，
   而补救是往课里灌不属于它的话（§11.1 的 v1）。**按字段切的那一版整条否掉，不设豁免台账。**
   `title` 臂留下，依据是渲染位置（§3.6.5–§3.6.6），**不是**「标题更重要」。
   **也不修 §3.5 那 6 处合法的 gloss 残余，不修 §3.6.4 里 `hidden`×2 与 `mumimo`
   那 3 处闭包内合法的 `variantLabel`。**
7. **不把 `tsc --noEmit` 挂进 `npm test`**。该做，但它会改整个仓库的测试口径，是另一刀；
   本切片靠运行期抛 + 普查补上（§5.2、§5.4）。

---

## §13 判断

这件事五个 agent 各自撞到过，而他们撞到的都是同一个**形状**：
一个仓库里有七种关于「课文写在哪些字段里」的答案，而没有一处检查它们是否一致。
修法不是「把漏的四处补进去」——那只换掉当期的症状，而且会顺手移动 50 个读者看过的分钟数。
修法是**把「取到全部」和「要哪一类」分成两件事**：
前者由结构遍历保证，一个字段都不漏，漏了就抛；
后者由每条规则自己按标签说，并且**允许两条规则给出不同的答案**——
因为禁词表与口径表的判据形状不同，它们对这四处的正确答案本来就不一样。

**而这一轮最该记下来的方法论是别的**：协调者给 jump label 另立一条规则，
依据是「jump label 是指向另一门课的路标」。那个依据**在这个仓库里没有指称**——
`JumpTarget` 只有 `label` 与 `find`，273/273，没有 `to`，
而 `CoursePanel.tsx:337-343` 自己写着 jump 只对**本课自己的录像**有意义。
**但他的担忧是对的**，只是方向相反：目的地不是 jump 跳过去的那门课，
而是本课 `needs` 的传递闭包——而那台机器课程早就有、测试早就在管。
**一个错的依据底下压着一个对的直觉，而区分这两者只能靠去量。**
28 条里 26 条在前置课里是带着括号讲过的；剩下 2 条，一条是课程第一门课按钮上的
「确认帧」而它 `needs` 为空。**那一处是整份盘点里最硬的发现，
而把 jump label 整类豁免掉就会把它一起买走。**

**第二条方法论，这一轮才看清：规则该严还是该松，不由字段名定，也不由补救代价定，
由那串字渲染在哪儿定。** 四轮里这条规则的分法换了四次
（33 条一刀切 → 按字段切三条 → 按补救代价切一条 → 按渲染位置切两条），
而每一次推翻都是一次测量干的，不是一次争论：
最后那一次靠的是 `CoursePanel.tsx` 的四个行号，加上
**16 条 `until`/`seeAlso` 边 16/16 指向后面的课**——
于是「一门课的标题会被印在它自己前置条件都还没满足的位置」成了一个可量的事实
（`radio-primer`#1 的 `limits` 旁印着 `fading`#39 的标题，而 `fading` 自己
21 门前置课读者一门都还没读），而不是一句「标题更重要」。
**`title` 是这四处里唯一没有 `needs` 保护的字符串，所以也是唯一该用严格臂的。**
探针编号（A–AB / AC–AO / AP–AS / AT–AV）与每一轮的作废声明都留在 §14，
它们是这份规格里最值钱的部分之一：**它们记的是哪个结论被哪次测量换掉了。**

量完之后，另一件最该记下来的不是那个网，是那个 **292 对 261**：
`limits` 被当作主路径渲染（默认展开，`CoursePanel.tsx:563`）、
被当作专业深度书写（术语密度比 `sources` 还高）、
在计时里被当作折叠内容（47 129 字，一分钟也不算）。
**这三件事不可能同时都对，而今天没有任何一处断言发现得了。**
这份规格修不了它，但它现在有了一个数、一个棘轮和一条写在纸上的矛盾。

---

## §14 对 brief 的更正（每条都自己核过）

1. **「`lessonStrings`（在 `tests/course/` 里）」——不在。** 它在
   `src/course/readability.ts:131`。`tests/course/` 里只有它的调用者和它的单元测试。
2. **「任何写在这四处的课文，对两张禁词表都是隐身的」——对禁词表是假的。**
   `wording.test.ts:46-53` 自己手加了这四处，实测 86 条禁词在四处上 **0 命中**；
   自称日期那条规则（`readability.test.ts:452-457`）同样四处不漏，**0 命中**。
   隐身的只有口径表。
3. **「两张表漏的是不是同一组」——不是。** 禁词表漏的是空集；
   口径表漏的是七处（四处 + `terms[].plain` + `deeper` + `sources`），
   其中后两处是**故意**的，有写明的理由。
4. **「四门 AMP 课的 `limits` 是空的」——是两门**（`amp-intro`、`amp-ppdu`）。
   `limits.test.ts:15-18` 的 docblock 自己写了 `amp-slots`/`amp-coexist` 已于 2026-10-02 迁移，
   而 `PAUSED_AMP`（`:35`）与 `:41-46` 的断言指名道姓地冻结了剩下那两门。
5. **「这四处一共有多少字」——51 019 个汉字，而 92.4 % 在 `limits` 一处**（47 129）。
   把四处当一类东西谈会把两件完全不同的事混在一起（§2.2）。
6. **「多少门课在这四处写了成段的话」——81 门，全部在 `limits`。
   `title` 与两种 `label` 里 ≥30 字的字符串是 0 条，最长 19 字。**
7. **「拿现在的禁词表去扫这四处，今天已违规几处」——0 处。**
   这个问题问的那条规则已经覆盖了那四处。要一个非零的数，得换规则（317）或换判据（33）。
8. **`mainPathChars` 把 `limits`/`deeper`/`sources` 排除、`numbers` 算在内——对，核过。**
   补两条 brief 没说的：它**也算 `terms`**（7 131 字），而**口径表不算 `terms`**；
   它**也算 `body`**（旧扁平形状，今天 83 门课全部迁移完，`body` 实际为空）。
9. **「全量 251 文件 / 6712 条绿」——文件数对，条数是 6 715。**
   实跑（`node node_modules/vitest/vitest.mjs run`）：**251 passed / 6 715 passed**，全绿。
   差的 3 条**核实了出处**，不是估的：`git show 6dc8c97 -- tests/ui/store-course.test.ts`
   新增 4 个 `it(`、删除 1 个，净 +3——6 712 + 3 = 6 715，对上了。那一刀把
   `src/player/player.ts`、`src/ui/App.tsx`、`src/ui/store.ts`、`tests/ui/store-course.test.ts`
   落地成 `6dc8c97`（`tests/ui/store-course.test.ts` +118 行）。
   **它一行也没碰 `src/course/` 或 `tests/course/`**，所以本规格的数不受影响；
   `tests/course` 单独跑是 **95 个文件 / 4 204 条**，全绿。
10. **「两套措辞规则的测试」这个说法本身偏小。** 读者文本在这个仓库里被取了 12 次
   （§1.1），其中只有 2 次是 brief 说的那两张表。真正该修的不是那两处，是那 12 处。

### §14.1 第二轮：对协调者第二封 brief 的更正

11. **「jump label 是指向另一门课的路标，规则要换成指向目的地」——目的地不存在。**
   `JumpTarget` 的键实测只有 `label` 与 `find`（273/273），**没有 `to`**；
   273 条 label 里没有一条含另一门课的标题或 id；`find` 是跑在本课自己录像上的谓词，
   `CoursePanel.tsx:337-343` 明文写着 *a jump only makes sense against this lesson's
   own recording*。所以那条规则**写不出来**（§3.6.1）。
   **而「按本课自己的场景」这条依据反而把 jump label 判给第 1 条**：
   variant label 命名本课**提供**的场景，jump label 命名本课录像里**确实存在**的记录，
   后者还被 `kit.ts:157-163` 当场断言（§3.6.3）。
12. **「jump 的 `to` 指向的课存不存在、有没有测试在管」——没有 `to`，而更硬的那件事有人管，
   83/83 全覆盖。** `kit.ts:157-163` 断言每个 `find` 真的匹配到本课 base run 里的一条记录
   （比「id 存不存在」强：它断言那一刻真的在录像里），外加每个 `watch` 的 `jump` 下标有效。
   JSON reporter 数 describe 名：**83 个 `"<id> · lesson shape"`，一个不缺**，
   jump 守卫测试 120 条。`amp-slots` 不走 `lessonShapeSuite`，是**手写的而且更对**
   （5 个 jump 里 2 个只在变体里发生，`:30-34` 写明理由）。**这一处没有洞。**
13. **「28 条里 26 条其实合法」是我量出来的，不是让步。** 放宽到 `needs` 传递闭包后，
   28 → **2**；而且那 26 条在闭包里是**带括号讲过的**（`bracketedAtFirstZhUse === true`），
   不是只被提过。所以协调者说「这条规则会把正确的课文判成违规」**对，33 那把尺太粗**；
   但「换成指向目的地」**那把尺不存在**，可用的那把是 `needs` 闭包。
14. **「如果是 0，就说是 0」——不是 0，是 2。** 这 2 处（最终都归臂二的 `jumpLabel`）是：
   `radio-primer|确认帧`（课程第一门，`needs` 为空，闭包大小 0，全课程唯一一门）、
   `small-frames|聚合 MPDU`（闭包 6 门，一门都没提过，讲它的 `ampdu` 在后面）。
15. **`terms[].plain` 的处置给了，不只记在清单里**（§3.5）：
   **永久不进括号规则**，理由是 272 行词表里 **101 行（37 %）**的 gloss 借用了别的词表术语
   —— 一条解释必然用到别处定义的词；它**已经在**禁词表与自称日期的网里；
   它**留在** `mainPathChars` 里（7 131 汉字，排在 `picture` 之前，是按阅读速度读的）；
   它**进** `needs` 闭包规则，8 处残余里 **6 处合法、2 处真违规**（都是多毫秒）。
16. **棘轮的数：我第一轮写的 279 是错的，正确是 289，而 292 是另一个判据。**
   协调者让我把两个数说清楚——说清楚之后发现其中一个本来就错了：
   279 那次我在比较的两边用了不一致的缩写匹配（一边整词边界、一边裸 `includes`），
   替 10 对开脱掉了。两侧同一把尺是 **289**。
   **292 = 判据 P（括号规则会红几条，287 括号臂 + 5 aka 臂）；
   289 = 判据 Q（`(课,术语)` 对，本课主路径从未命名）。** 两张表都列在 §3.4。
   `sources` + `deeper` 的判据 Q 之和恰好也是 279，**纯属巧合，所以更要写清楚**。
### §14.2 第三轮：按「补救代价」切之后，我上一轮的分法也作废

> **这一节的结论被 §14.3 推翻了一半**，原文保留，不改写：
> 第 18 条的「一条规则 / 5 处」和第 19 条对 `ofdma-dl | 下行` 的处置，
> 都在第四轮加回 `title` 臂之后作废。**最终是两条规则两个臂 / 6 处。**
> 第 20/21 条仍然有效（v1 的坏法、114 与 0 两个数）。

18. **我上一轮写的「三条规则 / 9 处」作废，正确是「一条规则 / 5 处」。**
   协调者的口径（按每一处的实际形态分，不按字段分）比我按字段切的更准，
   而照它切下去**严格臂是空的**——而且是**可证明空**，不是碰巧空：
   括号规则基线 0 失败 ⟹「在被判过的主路径上出现过、只是没带括号」全课程为空
   （实测 1 058 对里 **0** 对；逐字段 title/variant/jump/terms.plain/limits 全是 0）。
   **所以严格臂拿不到任何「零新增课文」的便宜活，而它今天抓的 5 条里 4 条是错抓。**
19. **协调者点名担心的两处，量出来都是他担心的那样。**
   `mumimo | 正交频分多址`：变体标签上是**缩写 `OFDMA`**（一个模式名），
   中文全称在这门课**任何地方都没有**，而带括号讲过它的 `ofdma-dl`
   **就是 `mumimo` 的直接 `needs`**。严格规则的补救确实是「让讲多用户 MIMO 的课替讲 OFDMA 的课开场」。
   `ofdma-dl | 下行`：**课的标题里就写着「下行」**，主路径一次没写（`DL` 也没有）。
   第三轮我把它放进闭包臂（中文词零出现 ⟹ 补救必然新增课文），**而这一步错了**：
   「补救要不要新增课文」和「新增的那段话属不属于这门课」是两个问题。
   **第四轮按渲染位置加回 `title` 臂之后，这一处是臂一今天唯一的真红**（§3.6.7、§14.3）。
20. **按字段切的那一版（v1）按 §11 的待遇否掉，写成 §11.1，指名道姓。** 并且标明它不是「空转」
   而是更坏的一种：**今天会红，而红在对的课文上**。（这一条第四轮仍然成立——
   被否掉的是按字段切，不是严格规则本身。）
21. **本轮新量的两个数**：jump label 术语里「已经在主路径上被命名」的 **114** 对
   （本来就不是违规，所以 28 这个数是干净的）；gloss 残余里「已经在主路径上」**0** 对。

### §14.3 第四轮：加回 `title` 臂，依据换成渲染位置

22. **我上一轮写的「一条规则 / 5 处」作废，最终是「两条规则两个臂 / 6 处」。**
   作废的理由是我漏了一个轴：只按「补救代价」切，问的是「补救要不要新增课文」，
   **不问「新增的那段话属不属于这门课」**。加上第二个轴（渲染位置）之后 `title` 独立。
23. **协调者给的那四个行号我核过了，全对**，而且可以量得更锋利：
   `:312`（目录 83 门全列，读者零阅读量时可见）、`:436`（别课的 `needs` 按钮，
   **66 个不同标题**被这样印出来）、`:581`/`:586`（别课 `limits` 旁的
   `limitUntil`/`limitSeeAlso`，**8 个不同标题**）。
   另三处（`:490` / `:364`+`:503` / `:449-453`）**一个跨课渲染点都没有**。
24. **「`until` 指向后面的课」比他说的还绝对：16 条边 16/16 指向后面，0 条指向前面或自身。**
   delta 最小 +1、中位 +13、**最大 +38**（`radio-primer`#1 → `fading`#39），
   而那一条里 `fading` 自己的 `needs` 闭包有 **21 门**是读者还没走到的。
   **这是「一门课的标题被印在它自己前置条件都没满足的位置」的实测形态。**
25. **一处把证据用准的更正**：`ofdma-dl` **不是**任何 `until`/`seeAlso` 的目标
   （它在 #40，是 `ru-diversity`/`ofdma-ul`/`mumimo`/`capstone` 四门的 `needs`）。
   **所以它的跨课曝光来自 `:312` 与 `:436`，不是 `:581`/`:586`。**
   §3.6.6 那条最强的证据支持的是**臂一这条规则**，不是这一处课文——写明，免得张冠李戴。
26. **§11.1 按要求改掉了**：它现在开头就说明自己批评的是**被否掉的 v1**（按字段切），
   并点明最终版的 `title` 臂「1 处真红、0 处豁免」是两者的全部差别。
   **这个会话里「新小节更正了、旧小节还在重述」已经第五次**，所以我把
   §3.6.3 的结论段和 §3.6.4 的标题也一起改了——那两节原来写着
   「所有 chrome 违规全部落在闭包臂」「只有第 5 处是真违规」，
   **在加回 `title` 臂之后都成了旧说法。**

### §14.4 第一轮的方法论自省（保留）

17. **我第一轮还量错过一次，和规格的结论无关但方法论相关**（§3.6.2 的引注）：
   用「测试文件里出现带引号的课程 id」近似覆盖率，得出「8 门课的 jump 没人管」——
   **8 门全都管着**，它们把 lesson 对象当变量传，源码里从不引用自己的 id 字符串。
   **坏的是尺。** 这是这一轮第二次：先是 279，再是这一处。

---

## §15 每个数怎么重跑

所有数字出自九个一次性探针（A–AB 第一轮、AC–AO 第二轮、AP–AS 第三轮、AT–AV 第四轮），
写成 `tests/course/zzprobe*.test.ts`、**跑完即删**——仓库里现在没有它们，
下面这张表写的是每个数的**判据**，照判据重写一个探针就能重跑，
这比留一份会腐烂的脚本更可靠。探针是普通的 vitest 文件，
`import { LESSONS } from '../../src/course/lessons'` 起手即可。

> **第二轮的 AJ/AK 是「一把尺」探针，而它存在的原因就是我量错过**：
> 第一轮 `limits` 的两个数（279 / 267）与第二轮重测（289 / 270）不一致，
> 查出来是我自己在比较的两侧用了不同的缩写匹配。
> **AJ/AK 把 `names()` 抽成一个 helper、所有字段用同一个**，
> 并且把括号臂与 aka 臂分开报——这才让 292 = 287 + 5 这件事看得见。
> **重跑任何一个与术语有关的数，用 AJ/AK，不要用 G2/S。**

重跑方式：

```bash
cd /d/wifi_sim/.claude/worktrees/feat-link-2g
node node_modules/vitest/vitest.mjs run tests/course/zzprobe.test.ts --reporter=basic
```

每个数对应的探针与它量的东西：

| 数 | 探针 | 怎么量 |
| --- | --- | --- |
| 83 门课 / wifi 47 · amp 4 · uwb 32 / 全部已迁移 | A | `LESSONS.length`、`trackOf`、`l.why !== undefined` |
| `limits` 368 条 · 81 门 · 键 `kind`/`text`/`until`(13)/`seeAlso`(3) · 只有 `text` 含汉字 | B | 遍历 `l.limits`，统计 `Object.keys` 与 `/[一-鿿]/` |
| 四处一条都不被两只走法作为字段取到（32 + 2 条字面重合） | C | `new Set(lessonStrings(l)).has(text)` / `new Set(zhMainTexts(l)).has(text)` |
| 字数 901 / 47 129 / 842 / 2 147；`mainPathChars` 和 179 215 | D, P, J | `zhChars` 逐字段求和 |
| 成段的话：`limits` 368/368 ≥30 字；chrome 0 条 ≥30 字、最长 19 | D | 排序取分位 |
| **禁词表 0 命中** | E | 把 `wording.test.ts` 的 `IMAGES`/`REGISTER`/`offences` 原样抄过来，扫四处 |
| **自称日期 0 命中** | F | 把 `ROTS` 四条模式原样抄过来，扫四处 |
| 口径表基线 0 失败 / append 317 / prepend 729 | G | `zhTermFailure` + `zhAkaViolations` 跑在 `zhMainTexts` 与 `zhMainTexts + 四处` 上，取差集 |
| 逐处归因 title 1 · limits 292 · variants 6 · jumps 25 | G2 | 一次只接一处 |
| `deeper` 81 · `sources` 180（对照组） | Q | 同 G2，接 `deeper` / `sources` |
| 判据 Q 逐字段：limits **289**/76 门 · jumps 28/16 · variants 4/3 · title 1/1 · sources 189/69 · deeper 90/39 | **AK** | `names(字段文本, t) && !names(zhMainText, t)`，两侧同一把尺 |
| **16 条 `until`/`seeAlso` 边 16/16 向前；delta 中位 +13、最大 +38；`radio-primer`→`fading` 那条有 21 门未达前置** | **AT** | 对每条边比 `COURSE_ORDER` 序号差；再数目标课 `needs` 闭包里序号大于源课的 |
| 跨课渲染的标题：目录 83 · `needs` 按钮 66 · 别课 `limits` 8 | **AT** | 数 `l.needs` 与 `until`/`seeAlso` 的不同目标 |
| **`title` 臂 = 1 处**（`ofdma-dl \| 下行`），闭包臂本会放过它 | **AU** | 只看 `l.title`，再查闭包 |
| `ofdma-dl` 在 #40、是 4 门的 `needs`、不是任何 `until`/`seeAlso` 的目标 | **AU** | 反查 |
| 另三处无跨课渲染点（`:490` / `:364`+`:503` / `:449-453`） | **AV** + 读 `CoursePanel.tsx` | 逐个渲染点读源码 |
| **引理：「主路径上有、只是没括号」全课程 0**（1 058 对里 0；逐字段 5 个 0） | **AP, AS** | `names(main,t)` 为真的对里，数 `bracketedAtFirstZhUse(main,t) === false` |
| 那 5 处逐处的形态（chrome 原文 / 出现的是 zh 还是 abbr / 中文词在本课哪些 section 出现 / 闭包里谁讲过） | **AQ** | 把 lesson 拆成 11 个 section 分别查 |
| jump 术语「已在主路径」114 对、gloss 残余「已在主路径」0 对 | **AR** | 同一把 `names()` 尺分桶 |
| **严格 chrome 33 处**（title 1 · variants 4 · jumps 28） | R, **AL** | 术语出现在 chrome 而不出现在 `zhMainText` |
| **放宽到 `needs` 闭包后 3 处**（title 0 · variants 1 · jumps 2） | **AL** | 同上，再查本课 `needs` 传递闭包的主路径 |
| **28 条 jump 术语里 26 条在闭包里「带括号讲过」** | **AM** | `bracketedAtFirstZhUse(闭包课主路径, t) === true` |
| `limits` 判据 P = 292（287+5）、判据 Q = **289** | **AJ, AK** | 一把尺量到底，见下 |
| `terms[].plain` append 8 / prepend 154 / 整行 190 | U, **AH** | 同 G |
| **8 处 gloss 残余里 6 处在闭包里合法、2 处真违规** | **AN** | 同 AM |
| **词表 272 行里 101 行的 gloss 借用了别的词表术语** | **AO** | 逐行查 `plain` 里是否命名了本行之外的术语 |
| `JumpTarget` 只有 `label` 与 `find`（273/273，无 `to`） | **AC** | `Object.keys(j)` 并集 + `typeof` |
| 273 条 jump label 无一含另一门课的标题或 id | **AC** | 对 83 个标题、83 个 id 逐条查 |
| **jump 守卫 83/83 覆盖、120 条测试** | — | `--reporter=json --outputFile=…`，数 `"<id> · lesson shape"` |
| `needs` 闭包：`radio-primer` 为 0（全课唯一），最大 38 | **AG** | 传递闭包 |
| 结构遍历 91 个字段族；CJK 筛子只剩 5 条非课文 | K, N | 无条件遍历整个 `Lesson`，按 `path` 归族 |
| 筛子会丢 2 125 条纯 ASCII（numbers 1961 · picture 104 · deeper 57 · quiz 3） | L, W | `lessonStrings` 里 `zhChars(s) === 0` 的条数 |
| 纯 ASCII 字符串里带 ISO 日期的 0 条；全课程空串 0 条 | W, X | 正则与 `trim().length` |
| 图：遍历 852 条（262 含汉字）vs `diagramTexts` 420 条 | O | 对每份 `spec` 两种走法各数一遍 |
| 分钟数：+chrome 7 门变、+limits 50 门变 6 门破上限；总和 1 740 | H | 重算 `raw`，与 `lessonMinutes(l)` 比 |
| margin：`rate` 差 1 个汉字 | H | `2.5 − |raw − round(raw/5)·5|`，乘 220 |
| 术语判过 979（底线 450）→ 加四处 1 296；`ZH_TERMS` 181 行 | I | `bracketedAtFirstZhUse(...) !== null` 计数 |
| 禁词 86 条（35 + 51）；`ZH_TERMS_EXCLUDED` 26 行 | — | 数源文件里的 `bad:` / `zh:` |
| **禁词 + 自称日期跑在全量无条件遍历上：11 735 条字符串、0 命中、0 命中** | AB | 整个 `Lesson` 无字段表、无筛子地走一遍 |
| 加宽 `selectivity.test.ts:114` 不会撞它的 10 个 `not.toContain` | Y | 取它多出的 8 条 label，逐 needle 查 |
| 47 门 Wi-Fi 课的 label 都不含「没有建模多径」 | Z | 同上，跑在 `trackOf(l) === 'wifi'` 上 |
| `limits[].text` 空串 0 条（加宽 `kit.ts` 的非空检查安全） | AA | `trim().length === 0` |
| `tests/course` 95 文件 / 4 204 条绿；全量 251 / 6 715 绿 | — | `node node_modules/vitest/vitest.mjs run [tests/course]` |
