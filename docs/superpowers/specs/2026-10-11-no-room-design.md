# 没有余地的那几门课 —— 设计规格

**2026-10-11。基线 `f64b0ac`（= `main`，已推）。分支 `feat/uwb-ranging`，worktree `feat-link-2g`。
本刀只写这一份文档：零源码、零测试、零 fixture 改动（`git status --porcelain` 为空，`npx tsc -b --force` exit 0）。**

读过：`.superpowers/sdd/STATE.md`、`.superpowers/sdd/learner-audit-report.md`、
`docs/wifi-course-backlog.md` 切片 W2、`docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md`。

---

## 0. 一句话结论

**那五门课不是同一种处境，而把它们并成一堆的正是一把用错了的尺。**

- 被当成「没有余地」的两门，**各自的修法比余量小**：实测 **+3 字**与 **+8 字**，
  两处都不会让任何一条断言变红。**那两笔债今天就能还，不需要拆课。**
  （口径先说定：brief 的「余 5 字／余 38 字」是**到翻档边界的距离**——第 5、第 38 个字翻档，
  **所以可用余量是 4 字与 37 字**。本文一律用后者，而两个数都在 §1.5 的表里。）
- 剩下三门里只有一门该拆（`@uwb-ancillary`），而且**不是这一刀**。
- 拆课的代价被 W2 高估了一个数量级：W2 写「保守估计 **+2 000** 字」，实测是 **+147 到 +457 字**，
  **索引迁移是 0 文件 0 处**（不是 38/58——那是插入**模块**的账，不是插入**课**的账）。
- 「立案并建议不批」我按第十条收口：**五门里四门不批，一门批但另开一刀。**

---

## 1. 那条线到底在哪 —— 被断言的量 vs spec 要求的量

### 1.1 `MAX_MINUTES` 今天被读了两次，两次都在取整后的值上

```
$ grep -rn "MAX_MINUTES" --include=*.ts . | grep -v node_modules
```

读它的断言只有两处，都比的是 `lessonMinutes(l)`——**取整到 5 之后**的值：

| 处 | 断言 | 比的是 |
| --- | --- | --- |
| `tests/course/readability.test.ts:117` | `expect(lessonMinutes(l)).toBeLessThanOrEqual(MAX_MINUTES)`（`fits one sitting`） | 取整值 |
| `tests/course/kit.ts:143` | 同一条，逐课形状套件里 | 取整值 |

`lessonMinutes` 是 `Math.max(5, Math.round(raw / 5) * 5)`，**没有任何夹紧**。
所以 raw 31.12 印出 30、断言 30 ≤ 30、**绿**；要 raw ≥ 32.5 才取整到 35 并变红。
**取整与 spec 之间的间隙是 2.5 分钟 = 550 个汉字**（`CHARS_PER_MINUTE = 220`）。

### 1.2 spec 要求的是 raw

`src/course/curriculum.ts` 里 `lessonMinutes` 的注释与 2026-09-25 的裁定是同一句话：

> a lesson that runs past 30 minutes is a lesson teaching two topics, and the answer is to split it

「runs past 30 minutes」说的是**跑了多久**，不是**印出来多少**。所以 spec 的量是 raw。

### 1.3 **而 raw 并不是没人断言 —— brief 这一条我顶回**

`tests/course/readability.test.ts:1393`：

```js
it('names the lessons already past the 30-minute ceiling in raw terms', () => {
  const over = ordered.filter((l) => rawMinutes(l) > MAX_MINUTES).map((l) => l.id).sort()
  expect(over, ...).toEqual(['ru-diversity', 'uwb-ancillary'])
})
```

**raw 被断言了，而且是精确的**——只是钉的是**名单**而不是**上界**。它的 docblock 自己说明为什么：

> So the set is pinned, not the margin. A third lesson crossing raw 30 is a content decision ...
> Backlog slice W2 holds the case for splitting these two; this assertion is what it asked for instead of the split.

### 1.4 所以这**不**是一处「绿着却证明不了它名字说的那件事」

判据就在名字里。`fits one sitting` 声称的是**印给读者的那个分钟数**装进一次坐下，
而它确实装得进（30 ≤ 30）；它从来没有声称 raw ≤ 30。
关于 raw 的那句话由另一条**按自己的量命名**的断言做出，而那一条今天**精确且为真**。
**两把尺，一把一个量，各自名副其实。** 这是本仓库自己的口径，不是漏网。

**真正缺的东西不在测试套件里**：raw 过线的那两门是一条**有记录、有理由、而没有到期日**的例外。
那就是这份规格要回答的事——**不是「修一处假绿」，而是「W2 自己写下的重新考虑条件到了没有」**。
（答案在 §5.3：到了，而且只到了一门。）

### 1.5 五门课在哪条线上 —— 实测

```
$ npx vite-node probes.local/noroom-five.ts      # 逐课 raw、分节字数、分块标题
$ npx vite-node probes.local/raw30.ts            # 上一刀留下的量具，复核 raw 与余量
```

| # | 课 | 主路径字 | sim 分钟 | raw | 印出 | 距 raw 30 | 距 (700, **4 400**) 上沿 | 距五分钟翻档 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 35 | `@selectivity` | 3 945 | 12（2 obs×2 ＋ 2 try×4） | **29.9318** | 30 | **＋15 字** | 455 | 565（到 32.5） |
| 42 | `@ru-diversity` | 4 030 | 12 | **30.3182** | 30 | **−70 字（已过线）** | **370** | 480（到 32.5） |
| 75 | `@uwb-ancillary` | 3 766 | 14（3 obs×2 ＋ 2 try×4） | **31.1182** | 30 | **−246 字（已过线）** | 634 | **304（到 32.5）** |
| 71 | `@uwb-m2m` | 2 965 | 14 | 27.4773 | 25 | ＋555 | 1 435 | **＋4 字可用**（第 5 字翻到 30） |
| 83 | `@uwb-mms-numbers` | 2 272 | 12 | 22.3273 | 20 | ＋1 688 | 2 128 | **＋37 字可用**（第 38 字翻到 25） |

**课号已逐一核过**（`probes.local/noroom-order.ts`），与上一刀审计表一致；brief 的课号这次没有偏。

### 1.6 **后两门的「墙」不是一堵墙 —— 这决定了后面四问的性质**

brief 的 5 字和 38 字，量的是**到下一个五分钟档的距离**（可用余量 4 字与 37 字）。
越过它**不违反任何上限**：

```
$ npx vite-node probes.local/noroom-fix.ts    # 逐个加字，打印每条尺的状态
@uwb-m2m +8 chars → raw=27.5136, stated 25→30 | fits-one-sitting: GREEN
                  | raw>30 set: unchanged | total 1925→1930 (toBe(1_925) RED)
```

翻档只会让**一条等式**（`toBe(1_925)`）变红，而那条等式的失败消息自己写着它就是为这件事存在的：

> **The equality is NOT relaxed** — it is deliberate that somebody looks at a new lesson's minutes

**所以这两门课没有上限问题。它们只有一条记账等式，而改它是一次显式编辑加一行理由。**

---

## 2. 逐课裁定：拆，还是重新配速 —— 五条结论，不一刀切

判据按 `curriculum.ts` 那句话的字面：**过线意味着在讲两个题目，所以先证明它真的在讲两个。**
下面每一门都给出候选缝（分块标题 ＋ `outcomes` 的对应），以及它过不过这一关。
分块标题与分块字数出自 `probes.local/noroom-five.ts`，`why`/`outcomes` 全文出自 `noroom-why.ts`。

### 2.1 `@uwb-ancillary`（#75，raw 31.1182）—— **该拆。缝是干净的。**

`outcomes` 四条正好 2 ＋ 2 分到两边，而两边的 `picture` / `numbers` 各自连成一段：

| 半 | 分块 | 讲什么 | `outcomes` | 分块字数 |
| --- | --- | --- | --- | --- |
| A | `picture[0..3]`、`numbers[0..3]` | 一条消息怎么被分装进几帧、占哪几个时隙、长度由哪两个存在位决定、**发起方与响应方为什么是反的** | [0]、[3] | 1 110 |
| B | `picture[4..6]`、`numbers[4..8]` | **缺的那一帧是被下一帧发现的**：三种「丢了」的粒度、三个丢法、而测距结果一个数也没动 | [1]、[2] | 1 111 |

两个题目独立：A 是**载送与定时**，B 是**丢帧的后果**。B 的三块 `numbers`
（丢中间 / 丢最后 / 丢第一帧）是一套自洽的对照，**不读 A 的任何一个数也成立**；
A 读完能回答 `outcomes[0]` 与 `[3]`，**不需要 B 的任何一句**。

**它上次「拆」过，但那一刀没从它身上拿走一个字。** `c9b9990`（2026-10-05）
把 `uwb-ancillary-request` **另立一门**，而 `@uwb-ancillary` 自己**只改了 `limits`**
（`readability.test.ts` 那段注释的原话：「`uwb-ancillary` itself did not move」）。
实测：它的 raw 在那一刀的提交信息里是 **31.118182**，今天是 **31.1182**——**一个字没动。**
**所以「几天前刚拆过一次」是真的，而「它已经被拆小过」是假的。**

### 2.2 `@ru-diversity`（#42，raw 30.3182）—— **缝干净，但先不拆；离那条会先红的尺还有 370 字**

| 半 | 分块 | 讲什么 | `outcomes` | 分块字数 |
| --- | --- | --- | --- | --- |
| A | `picture[0..2]`、`numbers[0..3]` | 一个成员的格数是**算出来的**：一片 RU 就是一段格号、等分取整、谁也没拿的那几格 | [0] | 1 260 |
| B | `picture[3]`、`numbers[4..9]` | **切薄之后变坏的是尾部不是平均**，而且只在一段余量上看得见 | [1]、[2] | 1 319 |

两个题目也独立，而且 **B 才是这门课标题说的那件事**（「切薄之后变坏的是分布的尾部，不是平均」），
A 是它的前置算术。缝过关。

**但它有一件 `@uwb-ancillary` 没有的事**：W2 第 3 条写着这门课的 4 030 字里
「有一大块是立案时被实测推翻的那个前提的交代……那部分不是赘述，是这门课的价值」。
把那一块劈开要重讲一遍前提，而**那是内容判断**。
**而它比 `@uwb-ancillary` 离硬红更远**：距 32.5 的悬崖 480 字（对 304）。
**它是第二个该拆的，不是第一个。**

### 2.3 `@selectivity`（#35，raw 29.9318）—— **不该拆，也不该再加字**

**第一，它没过线**。spec 的触发条件是 raw ＞ 30；29.9318 不是。

**第二，它的缝切不断它的论证。** 结构上有缝
（`picture[0..2]` ＋ `numbers[0..1]` = 「一个数演不出一部分深衰，标准按 26 音调分格」，
`picture[3..4]` ＋ `numbers[2..11]` = 「引擎怎么把那些格合成一个数，以及宽信道真正的代价」），
**但这门课的全部价值是一次比较**：`why` 自己写着「按直觉，信道越宽……应该越糟；
……**跑出来的方向与这个直觉相反**」。那个反直觉的结论**要两半都读完才成立**。
`outcomes[3]`（「判断什么时候打开这一节会改变结果，什么时候打开了与关着完全一样」）
更是跨整课的。**拆出来的任何一半都说不出这门课的结论——所以它不在讲两个题目，它在讲一个两步的题目。**

**第三，余 15 字是上一刀造成的，而它已经被钉住了。** 不需要新检查：
raw ＋16 字就让 `names the lessons already past the 30-minute ceiling in raw terms` 变红并点名它
（实测 `probes.local/noroom-fix.ts`：`+15 → raw=30.0000 绿`，`+16 → raw=30.0045 JOINS (RED)`）。
**这正是那条断言被写出来的用处。**

**第四，两条「重新配速」的路都要明确拒掉**，因为它们都是拿仪器开玩笑：

1. **把一条 `tryThis` 改成 `observe`**：sim 12 → 10，白捡 440 字。但 `observe` 是「去看」、
   `tryThis` 是「自己跑一次」，为了腾分钟而改它是**合法配置、后果为零**——
   `docs/inert-config-contract.md` 那一类，该拒。
2. **把 `numbers` 的内容搬进 `limits`**：`limits` 默认展开、读者照读，而 `MAIN_PATH_SECTIONS`
   不数它。`src/course/readability.ts` 的 `mainPathTexts` docblock 自己把这件事记成一笔债
   （「`limits[].text` is a quarter of the main path's length, rendered open by default and timed at zero」）。
   **拿一笔已记账的债去腾另一条尺的余量，是把两处都弄坏。** 该拒。

**结论：`@selectivity` 冻在原地。** 下一刀要给它加字，必须先从 `numbers` 里换出等量的字，
或者接受它进那张名单（那是一次显式编辑 ＋ 一行理由）。

### 2.4 `@uwb-m2m`（#71，raw 27.4773）—— **不拆。它欠的那处修法只要 3 个字。**

缝：9 块 `picture` ＋ 9 块 `numbers`，而 `why` 说的是**一个**题目
（「一次发送可以同时做两件事」）。四条 `outcomes` 是这一个题目的四个推论
（整数倍、谁算得出来、帧长上限、听不到就没有），**不是两个题目**。
`numbers[5]`「参与者上限，是算出来的」是推论之一，不是另立一课的题。**缝不过关。**

**而它根本不需要余量。** 上一刀列的真缺陷是 `outcomes[2]`：

> 说出全轮最长的一帧为什么属于什么都算不到的那个，以及**上限**由谁决定

修法是就地点名：**`上限` → `参与者上限`，＋3 个汉字**
（这门课自己的 `numbers[5]` 标题与那道 `quiz` 的 `explain` 用的就是「参与者上限」这个说法，
所以这不是新造词，是把本课已有的说法补回 `outcomes` 里）。

```
$ npx vite-node probes.local/noroom-fix2.ts
@uwb-m2m +3 → chars 2968, raw=27.49091, stated 25→25, total 1925→1925   all green
@uwb-m2m +4 → chars 2969, raw=27.49545, stated 25→25, total 1925→1925   all green
@uwb-m2m +5 → chars 2970, raw=27.50000, stated 25→30, total 1925→1930   *** toBe(1_925) RED ***
```

**余量是 4 个字，修法要 3 个。它装得进，还剩 1 个。**
上一刀把这一处记成「预算实质为零」，是因为它把修法估成了 ~8 字而没有去量最短的那个写法。

### 2.5 `@uwb-mms-numbers`（#83，raw 22.3273）—— **不拆。它的余量是 37 字，修法 8 字。**

缝：`why` 说的是**一笔**算术（「一笔在信封背面就能算完的算术……这一课就来算它」），
三条 `outcomes` 是这一笔的三段。**缝不过关，而且它离 30 分钟还有 1 688 字**，
spec 的触发条件根本没碰到。

真缺陷在 `picture[0]`（跨轨同形词「突发」，这里指能量的时间集中，不是 TXOP 那几帧）。实测：

```
@uwb-mms-numbers +8  → raw=22.3636, stated 20→20, total 1925→1925   all green
@uwb-mms-numbers +20 → raw=22.4182, stated 20→20, total 1925→1925   all green
@uwb-mms-numbers +37 → raw=22.4955, stated 20→20, total 1925→1925   all green
@uwb-mms-numbers +38 → raw=22.5000, stated 20→25, total 1925→1930   *** toBe(1_925) RED ***
```

**37 个字可用，修法 8 个字。** 「两课都加不进字」这句话对这一门是**假的**，
而让它看起来为真的是**拿到下一档的距离当上限读**（§1.6）。

### 2.6 五条结论

| 课 | raw 过线 | 缝过不过关 | 裁定 |
| --- | --- | --- | --- |
| `@uwb-ancillary` | 是（31.1182） | **过**（载送与定时 ／ 丢帧的后果） | **批拆，另开一刀**（§5） |
| `@ru-diversity` | 是（30.3182） | **过**（分配算术 ／ 分集尾部） | **暂不批**，条件见 §6.3 |
| `@selectivity` | 否（29.9318） | **不过**（一个两步的题目） | **不拆、冻在原地**，两条配速路径均拒 |
| `@uwb-m2m` | 否（27.4773） | 不过 | **不拆**；**今天修，＋3 字，全绿** |
| `@uwb-mms-numbers` | 否（22.3273） | 不过 | **不拆**；**今天修，＋8 字，全绿** |

---

## 3. 拆课的真实代价 —— 自己重量过的

### 3.1 **索引迁移是 0 文件 0 处，不是 38 / 58 —— brief 这一条我顶回**

38 / 58 是**插入一个模块**的账，**不是插入一门课**的账。两处原文都这么写：

- `src/course/curriculum.ts` 的 M13 注释：「every module inserted above the UWB track moves 33
  `module` fields with it (measured again on this slice: **58 edits across 38 files**)」
- `tests/course/readability.test.ts` 第 1257 行附近（W13 的记录）：「`claim-to-contribution` is the
  **SECOND lesson of the existing M13** … measured on that slice, **the index migration cost
  was 0 files and 0 sites**, against the 58-across-38 that W12b paid to open M13」

**这五门课都在已存在的模块里**（`probes.local/noroom-order.ts`）：
`@selectivity` M8（7 门）、`@ru-diversity` M9（7 门）、`@uwb-ancillary` M24（**已有 2 门**）、
`@uwb-m2m` M20（1 门）、`@uwb-mms-numbers` M28（2 门）。
**拆课加的是课，不是模块，所以 `MODULES.length` 不动，33 个 `module` 字段一个也不动。**
W3 那张账单与这一刀无关。

### 3.2 字数：**＋147 到 ＋457，不是 W2 写的 ＋2 000**

W2 的 ＋2 000 来自一条对的理由（「拆出来的那一半要有自己的 `why`/`outcomes`/`terms`/…」）
配一个没量的数。实测（`probes.local/noroom-split.ts`，缝按 §2 的候选、
两半各配一份**全套房屋标准脚手架 846 字**——`why`＋`outcomes`＋`terms`＋`observe`＋`tryThis`＋`quiz`
的全课程均值，出自 `probes.local/noroom-budget.ts`）：

| 课 | 今天的脚手架 | 两半 × 846 | **净增字** | 两半各自字数 | 分钟 |
| --- | --- | --- | --- | --- | --- |
| `@uwb-ancillary` | **1 545**（全课程最长） | 1 692 | **＋147** | 1 957 / 1 956 | 30 → 15＋15 = **30（Δ 0）** |
| `@ru-diversity` | 1 451 | 1 692 | **＋241** | 2 136 / 2 135 | 30 → **30（Δ 0）** |
| `@selectivity` | 1 235 | 1 692 | **＋457** | 2 201 / 2 201 | 30 → **30（Δ 0）** |
| `@uwb-m2m` | 1 109 | 1 692 | ＋583 | 1 774 / 1 774 | 25 → **30（Δ ＋5）** |
| `@uwb-mms-numbers` | 878 | 1 692 | ＋814 | 1 543 / 1 543 | 20 → **30（Δ ＋10）** |

**为什么这么便宜：这三门课的脚手架本来就远超均值。**
`@uwb-ancillary` 的 1 545 字是全课程最长的脚手架，两份房屋标准脚手架（1 692）只比它多 147。
**W2 把拆课当成「写一门新课」来估，而一门新课的 2 000–3 000 字里有两千是新 `picture`/`numbers`
——拆课不新写这一块，它只是搬过去。**

**分钟中性，而且是三门里的三门。** 原因是 sim 分钟守恒：
`@uwb-ancillary` 今天 3 obs ＋ 2 try = 14 分钟；拆成 (1 obs, 1 try) ＋ (2 obs, 1 try) 仍是 6 ＋ 8 = 14。
字数一分为二，两半各 raw ≈ 15。**所以 `toBe(1_925)` 对这三门的拆课不红。**

### 3.3 落地要动的文件与处数 —— 按 W13 那一刀的真实账单重量

W13（`a8809a8`，加一门课进已存在的模块）的结构性文件与行数：

```
$ git show a8809a8 --numstat -- src/course/lessons.ts src/course/curriculum.ts \
    tests/course/lessons.test.ts tests/course/readability-rules.test.ts \
    tests/course/readability.test.ts tests/fixtures/lesson-hashes.json docs/wifi-feature-coverage.md
25  18  docs/wifi-feature-coverage.md
13   3  src/course/curriculum.ts
 2   0  src/course/lessons.ts
 1   0  tests/course/lessons.test.ts
 7   3  tests/course/readability-rules.test.ts
15   4  tests/course/readability.test.ts
10   0  tests/fixtures/lesson-hashes.json
```

它自己的提交信息把口径列全了：「课数 89→90（**两处**）、分钟合计、层 4 ITEMS 新行、
TRACK 新行、跳转计数两处、`docs/wifi-feature-coverage.md` §17 的六个自述数与 §15 的四格、backlog 一处」。

**拆课与加课的差别**（逐条，本刀自己查的）：

| 处 | 加一门课（W13 实测） | 拆一门课（本刀的账） |
| --- | --- | --- |
| `src/course/<track>/<新 id>.ts` | 新文件 | 新文件 |
| `tests/course/<新 id>.test.ts` | 新文件 | 新文件，**并从原课的测试文件里搬走它那一半的断言** |
| `src/course/lessons.ts` | ＋2（import ＋ 数组项） | ＋2 |
| `src/course/curriculum.ts` | ＋1（`COURSE_ORDER`） | ＋1 |
| `tests/course/lessons.test.ts` | ＋1（`TRACK` 新行） | ＋1 |
| `tests/course/readability-rules.test.ts` | `toBe(90)`（`:295`）＋ `it` 标题「walks all 90 lessons」（`:281`）＋ 层 4 `ITEM_COUNTS` 新行 | **同上 ＋ 原课那一行要改**（五门的行都已定位，例如 `'uwb-ancillary': [3, 2, 4, 4, 5, 3, 4, 4]`） |
| `tests/course/readability.test.ts` | `toBe(90)`（`:1259`）＋ `toBe(1_925)`（`:1345`）＋ 注释 | 同上，而**分钟对那三门是 Δ 0 所以 `toBe(1_925)` 不动**；**`toEqual(['ru-diversity','uwb-ancillary'])`（`:1398`）要改** |
| `tests/fixtures/lesson-hashes.json` | ＋10 行 | **＋1 ＋ 变体数行，而哈希值与原课逐字相同**（实测：`cca` 与 `backoff` 同为 `5394a7e6`，`amp-ppdu` 与 `amp-intro` 同为 `f1e44e52`），**只增行** |
| `docs/wifi-feature-coverage.md` | §17 六个自述数 ＋ §15 四格 | 同上；**§17 的「课数」单元格还带家族分解**（`| 课数 | 90（Wi-Fi 52、AMP 5、UWB 33） |`，由 `wifi-coverage.test.ts:601` 的正则读出来比），UWB 拆课要改成 34 |
| `docs/wifi-course-backlog.md` | 一处 | W2 一节改成已完成，**原文留着当立案记录** |
| `module` 索引 | **0 文件 0 处** | **0 文件 0 处** |

**净账：2 个新文件 ＋ 6 个已有文件 / 约 12–14 处记账编辑 ＋ 1 份 fixture 只增行 ＋ 2 份文档。**
（W13 那一刀另动了 `fading.test.ts`、`uhr-ladder.test.ts`、`eventLogWindow.test.ts` 三个文件，
那是它自己加了场景变体带来的，**拆课骑原课的场景，所以这三类不出现**——
`tests/course/kit.ts:170` 的 `sameSceneAs` 就是为这件事存在的：
「loads …'s own scene, so the split costs the reader nothing」。）

### 3.4 课号会漂多少，以及 `@id` 那个把手兜不兜得住

课号是 `idx + 1`（`src/course/CoursePanel.tsx:459`），位置算出来的，**所以重编号不改任何文件**。
但它改**读者看到的数**：

| 拆谁 | 其后被重编号的课数 |
| --- | --- |
| `@selectivity`（#35） | **55 门** |
| `@ru-diversity`（#42） | **48 门** |
| `@uwb-m2m`（#71） | **19 门** |
| `@uwb-ancillary`（#75） | **15 门** |
| `@uwb-mms-numbers`（#83） | **7 门** |

**`ae73c1f` 加的 `@id` 把手兜住的是「读者引用一门课」这件事**，而且兜得住：
`CoursePanel.tsx` 在标题旁印 `@uwb-ancillary`，读者引这个就不会过期。

**但它兜不住另一半，而那一半今天就坏着。** 全仓搜写死的课号：

```
$ grep -rno "第 *[0-9]\+ *课" src/ tests/
src/course/CoursePanel.tsx:463   第 60 课   ← 注释里的历史记录，正确
src/course/CoursePanel.tsx:464   第 61 课   ← 同上
src/editor/EditorGuide.tsx:345   第 10 课   ← **读者看得见的正文，而它错了**
tests/ui/lessonHandle.test.ts:9  第 61 课   ← 注释里的历史记录，正确
```

`EditorGuide.tsx:345`（TXOP 保护那一段）写着「**第 10 课**对比了三者」。
`git log -1 -L 345,345:src/editor/EditorGuide.tsx` 给出 `22db72d`（2026-09-08，
提交标题自己写着 `lesson 10`）——**那天它是对的**。
今天 TXOP 保护是 **#31 `@txop-protect`**／#32 `@protect-policies`，而 #10 是 `@small-frames`。
**偏了 21 课，没有任何断言盯着它**（`grep -rn "第 10 课" tests/` 为空）。

**所以这一问的答案是：**
1. 拆课**本身**让 7 到 55 门课重编号，而**代价是 0 处编辑**；
2. `@id` 把手对「读者引用」够用；
3. **但它对「课程自己写下的课号」不够用，而仓库里现在就有一处 21 课的错**——
   这不是拆课带来的新风险，**是拆课会让它更错的既有缺陷**，
   **而它是本刀顶回 brief 时自己找到的**（brief 与上一刀都没点到它）。
   **建议：拆课那一刀（或 §5.1 第一行那一刀）顺手把 `EditorGuide.tsx:345` 改成 `@txop-protect`**
   ——用把手，不用数字——并加一条断言「读者正文里不出现写死的『第 N 课』」。
   **这条是结构事实，不读行文**，落在 2026-09-25 裁定的 Keep 一栏里。

---

## 4. 预算：拆一门课会让哪几条尺红，各要改成什么

全部出自 `probes.local/noroom-budget.ts`、`noroom-strings.ts`、`noroom-split.ts`、
`noroom-seam.ts`、`noroom-seam2.ts`。

| 尺 | 今天 | 拆一门课之后 | 红不红 | 改成什么 |
| --- | --- | --- | --- | --- |
| `all.length < 11500`（`readability-rules.test.ts:540`） | **10 824，余 675** | ＋45…＋54 条（**不是一门新课的 ~120 条**：`picture`/`numbers` 的字符串是搬的，只有非 body 的 45–54 条要写两遍） | **不红** | — |
| 分钟合计 `toBe(1_925)`（`readability.test.ts:1345`） | 1 925 | `@uwb-ancillary` / `@ru-diversity` / `@selectivity` **Δ 0**；`@uwb-m2m` ＋5；`@uwb-mms-numbers` ＋10 | **前三门不红** | 后两门才要改，而后两门不拆 |
| 课数 `toBe(90)` | 90 | 91 | **红（设计意图）** | **两处**：`readability.test.ts:1259`、`readability-rules.test.ts:295`，另加 `:281` 的 `it` 标题 |
| 模块数 `toBe(32)` | 32 | 32 | **不红** | — |
| raw 过线名单 `toEqual([...])`（`:1398`） | `['ru-diversity','uwb-ancillary']` | 拆 `@uwb-ancillary` 后两半各 raw ≈ 15 → 名单剩 `['ru-diversity']` | **红** | 改成 `['ru-diversity']`，并把本规格的裁定写进注释 |
| 逐课主路径 `(700, 4_400)`（`coverageNumbers.ts:75`） | 最长 `@ru-diversity` 4 030（余 **370**） | 两半 1 543…2 201，**都在带内**（下沿 700 也不破） | **不红** | — |
| 分节均值 ±10 %（14 个数，`readability-rules.test.ts` 的 `MEANS`） | 实测与记录值全部吻合 | 把任一均值推出带外需要新课在该节有数千字（逐条上界见 §4.1） | **不红** | — |
| `limits` 棘轮 292，余量 0（`coverageNumbers.ts:63`） | 292 / 0 | **`@uwb-ancillary` 两种界下都 ＋0**；`@ru-diversity` 乐观 ＋0、**悲观 ＋2** | **拆 `@uwb-ancillary` 不红** | — |
| 层 4 逐课八列条目数表 | 90 行 | 91 行，**并且原课那一行要改** | **红（设计意图）** | 新行 ＋ 原课行各一处 |
| fixture（`lesson-hashes.json`，293 键） | 只许增行 | ＋1 ＋ 变体数，**哈希值与原课逐字相同** | **不红** | 只增行，零 `-` |
| §17 自述数（`wifi-coverage.test.ts` 的 `FIGURES`，六个） | 六个数由测量比出来，文件里零写死数 | 课数、全课程主路径汉字（今天 200 533）、场景数三个移动 | **红（设计意图）** | 文档六数 ＋ §15 四格 ＋ 课数单元格的家族分解 |

### 4.1 分节均值的逐条上界（为什么它不是约束）

`probes.local/noroom-budget.ts` 把每条均值反解成「一门新课在这一节可以有多少字」：

| 节 | 记录值 | 今天 | 新课在本节的许可区间 |
| --- | --- | --- | --- |
| `title` | 11 | 11.7 | [−153, **47**] |
| `why` | 132 | 133.8 | [−1 231, 1 171] |
| `outcomes` | 79 | 80.0 | [−731, **707**] |
| `terms` | 89 | 90.9 | [−889, **731**] |
| `picture` | 640 | 654.1 | [−6 452, 5 196] |
| `numbers` | 726 | 728.2 | [−6 079, 7 135] |
| `limits` | 592 | 592.8 | [−4 749, 5 789] |
| `observe` | 124 | 124.6 | [−1 059, 1 197] |
| `tryThis` | 114 | 114.8 | [−994, 1 080] |
| `quiz` | 300 | 301.8 | [−2 590, 2 870] |

**最紧的一条是 `title` 的 47 字**，而全课程最长的标题远不到它。
这与那条断言自己的 docblock 一致（「a new lesson moves a mean by under 2 % even when it is an outlier」）。
**结论：±10 % 那十四条对拆课全部不构成约束，而这是量出来的，不是引述的。**

### 4.2 棘轮那一条值得单独写，因为它是拆课唯一一条**会凭空长出来**的债

`owed(l, limitsOf(l))` 拿一门课的 `limits` 去比**它自己**的主路径（`zhMainText`）。
**拆课把主路径一分为二，所以一条 `limits` 里被解释过的术语，可能留在了另一半。**
棘轮余量是 **0**，所以任何一笔新债都是红，而**抬 292 是人的决定**
（`coverageNumbers.ts`：「Paying debt down is never a human's call; **raising this is**，
and it is not a thing to do because the build is red」）。

两种界，都实测（`noroom-seam.ts` 乐观界：两半都留着原脚手架；
`noroom-seam2.ts` 悲观界：两半只留自己的分块，脚手架重写且不点名任何术语）：

| 课 | 今天的债 | 乐观界 | 悲观界 |
| --- | --- | --- | --- |
| `@uwb-ancillary` | 1 | **＋0** | **＋0** ← 它那条 `limits` 点到的唯一术语（媒体访问控制）**本来就已经是债** |
| `@selectivity` | 1 | ＋0（`limits[3]` 必须跟 B 半走；跟 A 走是 ＋3） | ＋0 |
| `@ru-diversity` | 8 | ＋0 | **＋2 → 292 变 294，红** |
| `@uwb-m2m` | 4 | ＋0 | ＋0 |
| `@uwb-mms-numbers` | 1 | ＋0 | ＋0 |

**`@uwb-ancillary` 在两个界下都是 ＋0——这是它排第一的第五条理由。**
`@selectivity` 那条 `limits[3]` 的实测值得记：它点名的六个术语里
`前导检测`／`载波侦听` 只在 `picture` 解释过、`多用户` 只在 `numbers` 解释过，
**所以那条限制放到 A 半要加 3 笔债**；放到 B 半是 0（`noroom-ratchet.ts` 逐条打印）。
**这是一条拆课时必须照着做的约束，而不是一条可以事后发现的红。**

---

## 5. 这一刀该不该做，什么时候做

### 5.1 结论

| 事 | 裁定 | 什么时候 |
| --- | --- | --- |
| `@uwb-m2m` ＋3 字、`@uwb-mms-numbers` ＋8 字 | **批。零断言变红。** | **下一刀，和别的小修一起走**；两处合计 ＋11 字，`all.length` ＋0（都是就地改字，不新增字符串） |
| `EditorGuide.tsx:345` 那个偏 21 课的课号 | **批修**（用 `@txop-protect` 换掉数字） | 同上一刀，＋一条「读者正文不写死课号」的断言 |
| `@uwb-ancillary` 拆成两门 | **批立案**（W2 的一半），**但另开一刀** | 见 §5.3 |
| `@ru-diversity` 拆成两门 | **立案，建议不批**（第十条） | 条件见 §6.3 |
| `@selectivity` 拆 / 重新配速 | **不批，两条配速路径都拒**（§2.3） | 冻结；条件见 §6.2 |
| `@uwb-m2m` / `@uwb-mms-numbers` 拆 | **不批**（缝不过关，且离线 555／1 688 字） | 不重开 |

「立案并建议不批」的先例，自己数过：

```
$ grep -rn "^## .*建议不批" docs/*.md
docs/wifi-course-backlog.md:286  W2
docs/wifi-course-backlog.md:532  W4
docs/wifi-course-backlog.md:557  W6
docs/wifi-course-backlog.md:581  W7
docs/wifi-course-backlog.md:616  W8（W8a 已完成 / W8b 不批）
docs/wifi-course-backlog.md:720  W10
$ grep -n "W14\|W15" docs/superpowers/specs/2026-10-10-tier4-design.md    # :635 :636，两条
```

**docs 里是 8 条**（STATE.md 第 12–14 行列的就是这 8 条；W14/W15 不在 backlog 里，
在 `2026-10-10-tier4-design.md:635-636` 的表里），**上一刀审计的 §8 是第 9 条**，
**本刀 §2.2 对 `@ru-diversity` 的是第十条**。
另有同形状的两条在 UWB 那张表（4d、5b），而 5b 是用户自己下的范围决定，形状不同。

### 5.2 为什么 `@uwb-ancillary` 该批 —— 六条，每条都是量出来的

1. **它过线最多，而且悬崖最近**：raw 31.1182，距 `fits one sitting` 真正变红的 32.5
   只剩 **304 字**——**五门里最窄的那道悬崖**。
2. **它的缝最干净**：`outcomes` 四条 2 ＋ 2 分开，两半的分块各自连成一段，
   两个题目（载送与定时 ／ 丢帧的后果）互不依赖（§2.1）。
3. **它最便宜**：净增 **＋147 字**（五门里最低），`all.length` ＋54 条（余量 675 → 621），分钟 **Δ 0**。
4. **索引代价为 0**，而且它所在的 M24 **已经有两门课**——读者打开「测距辅助信息」看到第三门，
   是这个模块本来的形状，不是一处异常。
5. **棘轮两种界下都 ＋0**（§4.2）——五门里唯一一门拆了之后不欠人情的。
6. **W2 自己点名它，而 W2 当年拒它的两条理由今天都不成立**：
   - 「在 1 202 字余量下这是做不到的」——**那条余量是全课程主路径 ＜190 000 的，
     而它已经被换成逐课 (700, 4 400)**，两半 1 957／1 956 落在带的正中间。
   - 「那个模块几天前才刚拆过一次」——实测 `c9b9990` **没从它身上拿走一个字**（§2.1），
     raw 31.118182 → 31.1182，**所以那一刀不是「它被拆小了」，是「它旁边多了一门课」**。

### 5.3 **W2 自己写下了重新考虑的条件，而那个条件已经到了**

`docs/wifi-course-backlog.md:326`，W2 的最后一段，原文：

> **什么时候该重新考虑批它：** 汉字上限的判据换成选项 B（逐课区间 `[800, 4 400]`）之后，
> `@ru-diversity` 的 4 030 离 4 400 只剩 370 字——**那一条会先红**，
> 而那时拆课就不再是一次长度修正，而是一条必须回答的问题。

**选项 B 今天是活的**：`tests/course/coverageNumbers.ts:75`
`export const MAIN_PATH_BAND = { floor: 700, ceiling: 4_400 }`（下沿是 700 不是 800，上沿一致），
**而 `@ru-diversity` 实测 4 030，离 4 400 正好 370 字**——W2 预测的数一个不差。
那条断言的失败消息自己写着答案：

> past twice the mean lesson. A lesson that long is a lesson teaching two topics,
> and the answer is to split it, never to compress it

**所以 W2 不该继续整条挂在「建议不批」下。它该被部分批准。**
而这就是「什么时候做」的答案：**不是现在这一刀**（这一刀只写规格），
**而是下一个课程刀，而且只做 `@uwb-ancillary` 那一半**，理由是 §5.2 的六条，
**并且 `@ru-diversity` 留在拒里**——因为它离硬红还有 370／480 字，
而它那一块「前提被实测推翻」的交代要怎么分，是一次内容判断（W2 第 3 条，仍然成立）。

### 5.4 为什么不是「一刀全拆」

三门一起拆会在一刀里同时推动课数（90 → 93）、raw 名单（清空）、层 4 三行 ＋ 三新行、
§17 六数、两份文档，**而其中 `@selectivity` 的缝过不了「两个题目」那一关**（§2.3）。
把一个过不了关的拆法和两个过得了关的拆法放在同一刀里，
是本仓库方法论第一条反对的事（STATE.md：**检查存在、措辞正确、量程不够**——
这里不够的是对「它真的在讲两个题目」的举证）。

---

## 6. 不拆的那几笔债，各自的还债条件

### 6.1 `@uwb-m2m` 与 `@uwb-mms-numbers` —— **不欠债了**

这两笔不是债。**它们今天就能还，而且还完之后余量还在**
（`@uwb-m2m` ＋3 用掉 4 字余量里的 3、`@uwb-mms-numbers` ＋8 用掉 37 字余量里的 8）。

**「先欠着」对它们不是一个可接受的结论，因为没有东西挡着。**
上一刀把它们记成「预算实质为零」用的是**到下一个五分钟档的距离**，
而那条距离不是上限（§1.6），并且**修法的字数从来没有被量过**。
**这正是「怀疑那把尺」**：`@uwb-m2m` 到边界 5 字是真的（可用 4 字），
修法 ~8 字是**估的**，而真实修法是 **3 字**——而那个估值从来没有被量过。

**还债期限：下一刀。** 两处合计 ＋11 字，零断言变红，
两条就地的 `it` 可以照上一刀四处修改的形状写（两侧都断言：课文用哪个词，解释它的那一行就必须含那个词）。

### 6.2 `@selectivity` —— 债是「没有余量」，条件是触发式的

**欠的不是一处修法**（它的那一处上一刀已经修了，用掉 41 字），**欠的是余量本身：15 字。**

**还债条件（触发式，不设日期）**：下一刀要给 `@selectivity` 加任何字时，必须二选一：
1. 从 `numbers` 里换出不少于新增量的字（它有 12 块 `numbers`、1 715 字，最长一块 300 字），**或者**
2. 接受它进 raw 过线名单——那是改 `readability.test.ts:1398` 的一次显式编辑，
   **而那一条进名单之后，W2 的触发条件对第三门课也成立，该连带重估。**

**不许的两条**：改 `observe`/`tryThis` 的条数，或把 `numbers` 搬进 `limits`（§2.3）。

### 6.3 `@ru-diversity` —— 第十条「立案并建议不批」，条件写明

**还债条件（二者先到者）：**
1. **主路径到 4 200 字**（距 `MAIN_PATH_BAND.ceiling` 200 字，今天 4 030／余 370）；**或者**
2. **任何一刀需要给它加字**——因为那时「加字」和「拆课」是同一个决定，
   而 §2.2 已经证明它的缝过关，所以那时不需要再立一次案，**照 §2.2 的 A/B 划分做即可**。

**落地时必须先跑 `noroom-seam2.ts`**：它的悲观界是 **＋2 笔棘轮债**（§4.2），
而棘轮余量是 0。两半的 `why`/`numbers` 必须把 `信噪比`、`接入点`、`下行` 这三个词
留在点到它们的那条 `limits` 所在的那一半（`noroom-ratchet.ts` 逐条打印它们今天在哪几节）。

**连带条件**：如果 `@uwb-ancillary` 按 §5 拆了，raw 过线名单会变成 `['ru-diversity']`
——**一门课的名单是一条很难解释的断言**。那时该把它改写成别的形状还是保留单元素名单，
是那一刀要回答的；**本规格的建议是保留单元素名单并在注释里指回这一节**，
因为改判据的形状要人批，而 W2 的记录已经在那一行上。

---

## 7. 量具（都可重跑）

本刀新建，留在 `probes.local/`（`*.local` 已 gitignore；**上一刀留下的九个量具一个没动**；
本刀的中间产物没有别的文件）：

| 量具 | 量什么 |
| --- | --- |
| `noroom-five.ts` | 五门课逐课：raw、sim、分节字数、每一块 `picture`/`numbers` 的标题与字数、`needs` |
| `noroom-order.ts` | `COURSE_ORDER` 全表带序号与 `module`——课号与模块归属的唯一出处 |
| `noroom-budget.ts` | 十四条分节均值的今天值 ＋ 反解出的「新课许可区间」；`all.length`；逐课字符串数；脚手架字数分布 |
| `noroom-strings.ts` | 拆课在 `all.length` 上的真实代价（非 body 字符串数） |
| `noroom-split.ts` | 五门课的拆课算术：两半字数、raw、分钟、净增字 |
| `noroom-fix.ts` / `noroom-fix2.ts` | 逐个加字，打印每条尺的状态——§1.6 与 §2.4／§2.5 的全部数字 |
| `noroom-ratchet.ts` | 每条 `limits` 点到哪些术语、各在哪几节被解释过（棘轮的脆弱点） |
| `noroom-seam.ts` / `noroom-seam2.ts` | 按 §2 的候选缝模拟拆课，算乐观／悲观两界的新棘轮债 |
| `noroom-tracks.ts` | 三条轨的课数（52／5／33） |
| `noroom-newcourses.ts` | 最近八门新课各自的棘轮贡献 |
| `noroom-why.ts` | 五门课的 `why`/`outcomes`/`observe`/`tryThis` 全文——判缝用的 |

跑法一律 `npx vite-node probes.local/<名>.ts`。
**没有起开发服务器**（这一刀不需要）；**十二个旧端口一个没动**。

---

## 8. 我顶回 brief 的地方（五处，每处带证据）

1. **「`MAX_MINUTES` 今天断言在取整后的值上，而 raw 过线却断言绿」——只对一半。**
   raw **有**精确断言（`readability.test.ts:1393`），钉的是名单而不是上界，
   而那一条今天为真。所以**不是一处「绿着却证明不了它名字说的那件事」**（§1.3、§1.4）。
2. **「拆课代价 38 文件 / 58 处，要自己重量」——重量过了，是 0 文件 0 处。**
   38/58 是插入**模块**的账；这五门都在已存在的模块里。
   W13 那一刀的实测（`readability.test.ts` 的 W13 注释）就是 0/0（§3.1）。
3. **「`uwb-m2m` 与 `uwb-mms-numbers` 两课都加不进字」——假。**
   实测余量 4 字与 37 字，修法 3 字与 8 字，**两处都装得进，零断言变红**（§2.4、§2.5）。
   上一刀把「到下一个五分钟档的距离」当上限读了，而那不是上限。
4. **「拆课是加字」——对，但 W2 的 ＋2 000 高了一个数量级。**
   实测 ＋147／＋241／＋457，**而分钟是 Δ 0**（§3.2）。
5. **「九条立案并建议不批」——docs 里是 8 条**（6 条在 backlog、2 条在 tier4 设计的表里），
   加上一刀审计的 §8 是 9，本刀是第 10（§5.1）。

**另外三处顺手找到的既有缺陷**（brief 与上一刀都没点到）：

- **`src/editor/EditorGuide.tsx:345` 的「第 10 课对比了三者」偏了 21 课。**
  写于 `22db72d`（2026-09-08，当天 TXOP 保护就是第 10 课），今天是 #31／#32。
  **没有任何断言盯着它**（§3.4）。
- **`.superpowers/sdd/STATE.md:8` 的轨道 census 算错了**：写「Wi-Fi 53 ＋ AMP 5 ＋ UWB 33」＝ 91，
  而课数是 90。实测 **Wi-Fi 52 ＋ AMP 5 ＋ UWB 33**
  （`npx vite-node probes.local/noroom-tracks.ts`），
  与 `docs/wifi-feature-coverage.md:737` 的「90（Wi-Fi 52、AMP 5、UWB 33）」一致。
- **「新课必须贡献 0 笔棘轮债，而已有六门新课做到过」**：抽查八门，七门是 0
  （`claim-to-contribution`、`uhr-rate-ladder`、`link-2g`、`amp-backscatter`、
  `uwb-ancillary-request`、`wan-rtt`、`edca-tamper`），**而 `@fading` 贡献 5 笔**
  （`probes.local/noroom-newcourses.ts`）。那句话是对多数而不是全体。

---

## 9. 疑虑

1. **§2 的五条缝是我读分块标题与 `outcomes` 划出来的，不是作者划的。**
   `@uwb-ancillary` 那一条我有信心（`outcomes` 自己 2 ＋ 2 分开，而 B 半的三块 `numbers`
   是一套自洽的对照），**但 A/B 具体哪一块归哪半，落地时作者会改，而每改一次都要重跑
   `noroom-seam2.ts`**——棘轮余量是 0，而 §4.2 已经量出 `@selectivity` 那条 `limits[3]`
   放错位置会 ＋3。
2. **＋147 字那个数假设两半各配一份 846 字的房屋标准脚手架。**
   真实的 `why` 要重写两遍（两半的 `why` 都要交代它在整条链上的位置），
   而 `@uwb-ancillary` 今天的 `why` 是 237 字（均值 134）。
   **如果两半的 `why` 都写到 237，净增变 ＋353。**
   **三门的分钟中性在这个范围里都还成立**（两半各 raw 15 附近，离 17.5 的档界有两百多字），
   但净增 ＋500 以上就要重算。
3. **我没有读完这五门课的 `picture`/`numbers` 全文**，读的是 `why`／`outcomes`／
   `observe`／`tryThis` 全文 ＋ 全部 44 个分块的标题与字数。
   **「两个题目」那一关我是按标题与 `outcomes` 的对应判的**，这是判断，不是测量。
4. **`EditorGuide.tsx:345` 那一处我没有在浏览器里确认它今天还印给读者看。**
   它在 `<D t="TXOP 保护">` 里，按代码是编辑器指南的一段正文；
   **但「它在源码里」和「读者今天看得见它」是两件事，而我只核了前一件。**
5. **本刀一行源码都没改，所以全量没跑。** `npx tsc -b --force` exit 0、
   `npx vitest run tests/course/readability.test.ts tests/course/readability-rules.test.ts`
   **2 文件 / 1 060 条全绿**（这两个文件装着 §4 那张表里的绝大多数尺），
   **但 276 文件 / 7 937 条的全量我没跑**——没有改动，所以基线就是基线；
   **而「没有改动所以不用跑」在这个仓库被顶回过**，所以这一条我标成疑虑而不是结论。
